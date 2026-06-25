/**
* Validation harness — POST /:Entity/Query capability detection end-to-end.
*
* Drives the real pict EntityProvider (../../../pict/pict) against two servers:
*
*   1. a SUPPORTED server: a real meadow-endpoints instance (this repo) that
*      advertises RetoldMetadata.Capabilities.QueryEndpoint and serves
*      POST /1.0/Books/Query.
*   2. an UNSUPPORTED server: a hand-rolled HTTP server that mimics an older
*      deployment — its Schema response carries NO RetoldMetadata, it 404s
*      POST /Query, and it rejects any request whose URI exceeds a (simulated)
*      gateway length cap with 414, reproducing the long-URI failure this
*      feature exists to avoid.
*
* For each server the harness issues a read whose meadow filter (a large IN
* list) blows past the URI cap, plus a short read, and asserts which transport
* the provider actually used and whether the read succeeded. Prints [ok]/[fail]
* per invariant and exits non-zero on any failure.
*
* Run: node integration/QueryEndpoint-Capability-Harness.js
*
* @license MIT
*/

const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');
const libMeadow = require('meadow');
const libMeadowEndpoints = require('../source/Meadow-Endpoints.js');
const libMeadowConnectionSQLite = require('meadow-connection-sqlite');
const libHTTP = require('http');

// The pict client lives in a sibling repo; require it by path. It brings its
// own fable in its node_modules, which is fine — client and server only ever
// meet over HTTP.
const libPict = require('../../../pict/pict/source/Pict.js');

const _BookSchema = require('../test_support/model/meadow_schema/BookStore-MeadowSchema-Book.json');

const SUPPORTED_PORT = 9971;
const UNSUPPORTED_PORT = 9972;
// Simulated gateway/server URI length cap. Node's own default maxHeaderSize is
// ~16KB (request line included); proxies like Kong cap lower. 8000 is a
// conservative, clearly-over-the-line value for the harness.
const URI_LIMIT_BYTES = 8000;

const SEED_BOOKS =
[
	{ Title: 'Angels & Demons', Genre: 'Thriller', PublicationYear: 2000 },
	{ Title: 'Dune', Genre: 'Science Fiction', PublicationYear: 1965 },
	{ Title: 'Neuromancer', Genre: 'Science Fiction', PublicationYear: 1984 },
	{ Title: 'Snow Crash', Genre: 'Science Fiction', PublicationYear: 1992 },
	{ Title: 'The Da Vinci Code', Genre: 'Thriller', PublicationYear: 2003 }
];

// ---- result tracking -------------------------------------------------------

const _Results = [];
const record = (pName, pOK, pDetail) =>
{
	_Results.push({ Name: pName, OK: pOK, Detail: pDetail || '' });
	const tmpTag = pOK ? '[ok]  ' : '[fail]';
	// eslint-disable-next-line no-console
	console.log(`${tmpTag} ${pName}${pDetail ? ` — ${pDetail}` : ''}`);
};

// ---- supported server (real meadow-endpoints) ------------------------------

const bootSupportedServer = (fCallback) =>
{
	const tmpFable = new libFable(
		{
			Product: 'QueryHarnessSupported',
			ProductVersion: '1.0.0',
			APIServerPort: SUPPORTED_PORT,
			SQLite: { SQLiteFilePath: ':memory:' },
			LogStreams: [ { streamtype: 'console', level: 'fatal' } ],
			MeadowEndpointsSessionDataSource: 'None'
		});

	tmpFable.serviceManager.addServiceType('OratorServiceServer', libOratorServiceServerRestify);
	tmpFable.serviceManager.addServiceType('MeadowSQLiteProvider', libMeadowConnectionSQLite);
	tmpFable.serviceManager.instantiateServiceProvider('MeadowSQLiteProvider');

	tmpFable.MeadowSQLiteProvider.connectAsync((pConnectError) =>
	{
		if (pConnectError)
		{
			return fCallback(pConnectError);
		}
		const tmpDB = tmpFable.MeadowSQLiteProvider.db;
		tmpDB.exec(
			`CREATE TABLE IF NOT EXISTS Book (
				IDBook INTEGER PRIMARY KEY AUTOINCREMENT,
				GUIDBook TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
				CreateDate TEXT, CreatingIDUser INTEGER NOT NULL DEFAULT 0,
				UpdateDate TEXT, UpdatingIDUser INTEGER NOT NULL DEFAULT 0,
				Deleted INTEGER NOT NULL DEFAULT 0, DeleteDate TEXT, DeletingIDUser INTEGER NOT NULL DEFAULT 0,
				Title TEXT NOT NULL DEFAULT '', Type TEXT NOT NULL DEFAULT '', Genre TEXT NOT NULL DEFAULT '',
				ISBN TEXT NOT NULL DEFAULT '', Language TEXT NOT NULL DEFAULT '', ImageURL TEXT NOT NULL DEFAULT '',
				PublicationYear INTEGER NOT NULL DEFAULT 0
			);`);
		const tmpInsert = tmpDB.prepare(`INSERT INTO Book (Title, Genre, PublicationYear) VALUES (?, ?, ?)`);
		for (let i = 0; i < SEED_BOOKS.length; i++)
		{
			tmpInsert.run(SEED_BOOKS[i].Title, SEED_BOOKS[i].Genre, SEED_BOOKS[i].PublicationYear);
		}

		const tmpMeadow = libMeadow.new(tmpFable, 'Book')
			.setProvider('SQLite')
			.setSchema(_BookSchema.Schema)
			.setJsonSchema(_BookSchema.JsonSchema)
			.setDefaultIdentifier(_BookSchema.DefaultIdentifier)
			.setDefault(_BookSchema.DefaultObject);

		const tmpOrator = new libOrator(tmpFable, {});
		tmpOrator.initialize(() =>
		{
			const tmpEndpoints = libMeadowEndpoints.new(tmpMeadow);
			tmpEndpoints.connectRoutes(tmpOrator.serviceServer);
			tmpOrator.startService((pStartError) =>
			{
				if (pStartError)
				{
					return fCallback(pStartError);
				}
				const tmpTeardown = (fDone) =>
				{
					try { tmpDB.close(); } catch (pIgnore) { /* ignore */ }
					if (tmpOrator.serviceServer && tmpOrator.serviceServer.server)
					{
						return tmpOrator.serviceServer.server.close(() => { return fDone(); });
					}
					return fDone();
				};
				return fCallback(null, tmpTeardown);
			});
		});
	});
};

// ---- unsupported server (legacy meadow-endpoints mimic) --------------------

const bootUnsupportedServer = (fCallback) =>
{
	const tmpAllBooks = SEED_BOOKS.map((pBook, pIndex) => { return Object.assign({ IDBook: pIndex + 1 }, pBook); });

	const tmpServer = libHTTP.createServer((pRequest, pResponse) =>
	{
		const tmpSend = (pStatus, pBody) =>
		{
			const tmpPayload = JSON.stringify(pBody);
			pResponse.writeHead(pStatus, { 'Content-Type': 'application/json' });
			pResponse.end(tmpPayload);
		};

		// Simulate a gateway/server that rejects over-long request URIs.
		if (pRequest.url.length > URI_LIMIT_BYTES)
		{
			return tmpSend(414, { Error: 'URI Too Long' });
		}

		// Legacy Schema: NO RetoldMetadata — the client must treat this as unsupported.
		if (pRequest.method === 'GET' && pRequest.url === '/1.0/Book/Schema')
		{
			return tmpSend(200, { title: 'Book', type: 'object', properties: { IDBook: {}, Title: {}, Genre: {} } });
		}
		// Legacy count read.
		if (pRequest.method === 'GET' && pRequest.url.indexOf('/1.0/Books/Count') === 0)
		{
			return tmpSend(200, { Count: tmpAllBooks.length });
		}
		// Legacy filtered / paged reads.
		if (pRequest.method === 'GET' && pRequest.url.indexOf('/1.0/Books') === 0)
		{
			return tmpSend(200, tmpAllBooks);
		}
		// The whole point: an older deployment does NOT serve POST /Query.
		if (pRequest.method === 'POST' && pRequest.url.indexOf('/1.0/Books/Query') === 0)
		{
			return tmpSend(404, { Error: 'Not Found' });
		}
		return tmpSend(404, { Error: 'Not Found' });
	});

	tmpServer.listen(UNSUPPORTED_PORT, () =>
	{
		const tmpTeardown = (fDone) => { return tmpServer.close(() => { return fDone(); }); };
		return fCallback(null, tmpTeardown);
	});
};

// ---- client + scenarios ----------------------------------------------------

// Build a meadow IN-list filter long enough to exceed URI_LIMIT_BYTES once
// embedded in a GET URL, while staying well under SQLite's bound-variable cap.
// The 5 real IDs are included so the supported server returns all seed rows.
const buildLongFilter = () =>
{
	const tmpIDs = [ 1, 2, 3, 4, 5 ];
	for (let i = 0; i < 900; i++)
	{
		tmpIDs.push(1000000000 + i);
	}
	return `FBL~IDBook~INN~${tmpIDs.join(',')}`;
};

const main = () =>
{
	const tmpHarnessPict = new libPict({ Product: 'QueryHarnessClient', ProductVersion: '1.0.0', LogStreams: [ { streamtype: 'console', level: 'fatal' } ] });

	// One shared rest client across both providers — instrument it once and
	// attribute each call to a server by its URL.
	const tmpCallLog = [];
	const tmpRestClient = tmpHarnessPict.EntityProvider.restClient;
	const tmpOriginalGet = tmpRestClient.getJSON.bind(tmpRestClient);
	const tmpOriginalPost = tmpRestClient.postJSON.bind(tmpRestClient);
	tmpRestClient.getJSON = (pOptionsOrURL, fCallback) =>
	{
		const tmpURL = (typeof pOptionsOrURL === 'string') ? pOptionsOrURL : pOptionsOrURL.url;
		tmpCallLog.push({ Method: 'GET', URL: tmpURL });
		return tmpOriginalGet(pOptionsOrURL, fCallback);
	};
	tmpRestClient.postJSON = (pOptions, fCallback) =>
	{
		tmpCallLog.push({ Method: 'POST', URL: pOptions.url });
		return tmpOriginalPost(pOptions, fCallback);
	};

	const tmpLongFilter = buildLongFilter();

	const makeProvider = (pPort) =>
	{
		const tmpProvider = tmpHarnessPict.instantiateServiceProviderWithoutRegistration('EntityProvider');
		tmpProvider.options.urlPrefix = `http://localhost:${pPort}/1.0/`;
		// Share the instrumented rest client.
		tmpProvider.restClient = tmpRestClient;
		return tmpProvider;
	};

	const callsFor = (pPort, pMethod) =>
	{
		return tmpCallLog.filter((pCall) => { return pCall.Method === pMethod && pCall.URL.indexOf(`localhost:${pPort}`) !== -1; });
	};

	let tmpSupportedTeardown = null;
	let tmpUnsupportedTeardown = null;

	const finish = (pExitCode) =>
	{
		const fAfterSupported = () => { if (tmpSupportedTeardown) { return tmpSupportedTeardown(() => { return process.exit(pExitCode); }); } return process.exit(pExitCode); };
		if (tmpUnsupportedTeardown)
		{
			return tmpUnsupportedTeardown(fAfterSupported);
		}
		return fAfterSupported();
	};

	bootSupportedServer((pSupportedError, pSupportedTeardown) =>
	{
		if (pSupportedError)
		{
			record('boot supported server', false, pSupportedError.message);
			return finish(1);
		}
		tmpSupportedTeardown = pSupportedTeardown;
		record('boot supported server', true, `:${SUPPORTED_PORT}`);

		bootUnsupportedServer((pUnsupportedError, pUnsupportedTeardown) =>
		{
			if (pUnsupportedError)
			{
				record('boot unsupported server', false, pUnsupportedError.message);
				return finish(1);
			}
			tmpUnsupportedTeardown = pUnsupportedTeardown;
			record('boot unsupported server', true, `:${UNSUPPORTED_PORT}`);

			const tmpSupportedProvider = makeProvider(SUPPORTED_PORT);
			const tmpUnsupportedProvider = makeProvider(UNSUPPORTED_PORT);

			// Scenario A: supported server + long filter -> POST /Query, success.
			tmpSupportedProvider.getEntitySet('Book', tmpLongFilter, (pErrorA, pRecordsA) =>
			{
				record('supported + long filter: read succeeds', !pErrorA && Array.isArray(pRecordsA) && pRecordsA.length === SEED_BOOKS.length,
					pErrorA ? pErrorA.message : `${pRecordsA && pRecordsA.length} records`);

				const tmpSupportedPosts = callsFor(SUPPORTED_PORT, 'POST');
				const tmpSupportedReadGets = callsFor(SUPPORTED_PORT, 'GET').filter((pCall) => { return !pCall.URL.endsWith('/Schema'); });
				const tmpSupportedSchemaGets = callsFor(SUPPORTED_PORT, 'GET').filter((pCall) => { return pCall.URL.endsWith('/Schema'); });

				record('supported: used POST /Query for reads', tmpSupportedPosts.length >= 2 && tmpSupportedPosts.every((pCall) => { return pCall.URL.indexOf('/Books/Query') !== -1; }),
					`${tmpSupportedPosts.length} POST /Query calls`);
				record('supported: issued NO long GET reads', tmpSupportedReadGets.length === 0,
					`${tmpSupportedReadGets.length} GET reads`);
				record('supported: probed Schema exactly once', tmpSupportedSchemaGets.length === 1,
					`${tmpSupportedSchemaGets.length} Schema probes`);
				record('supported: capability cache says SupportsQuery=true', tmpSupportedProvider.endpointCapabilityCache[`http://localhost:${SUPPORTED_PORT}/1.0/::Book`] && tmpSupportedProvider.endpointCapabilityCache[`http://localhost:${SUPPORTED_PORT}/1.0/::Book`].SupportsQuery === true);

				// Scenario B: unsupported server + long filter -> GET, fails on 414.
				tmpUnsupportedProvider.getEntitySet('Book', tmpLongFilter, (pErrorB) =>
				{
					record('unsupported + long filter: read FAILS (URI too long)', !!pErrorB,
						pErrorB ? `errored as expected (${(pErrorB.message || '').slice(0, 48)}...)` : 'unexpectedly succeeded');

					const tmpUnsupportedPosts = callsFor(UNSUPPORTED_PORT, 'POST');
					const tmpUnsupportedGets = callsFor(UNSUPPORTED_PORT, 'GET');
					const tmpLongGet = tmpUnsupportedGets.find((pCall) => { return pCall.URL.length > URI_LIMIT_BYTES; });

					record('unsupported: never used POST /Query', tmpUnsupportedPosts.length === 0,
						`${tmpUnsupportedPosts.length} POST calls`);
					record('unsupported: attempted a GET whose URI exceeds the cap', !!tmpLongGet,
						tmpLongGet ? `${tmpLongGet.URL.length} bytes > ${URI_LIMIT_BYTES}` : 'no oversized GET seen');
					record('unsupported: capability cache says SupportsQuery=false', tmpUnsupportedProvider.endpointCapabilityCache[`http://localhost:${UNSUPPORTED_PORT}/1.0/::Book`] && tmpUnsupportedProvider.endpointCapabilityCache[`http://localhost:${UNSUPPORTED_PORT}/1.0/::Book`].SupportsQuery === false);

					// Scenario C: unsupported server + SHORT filter -> GET, success (fallback works).
					tmpUnsupportedProvider.getEntitySet('Book', 'FBV~Genre~EQ~Science Fiction', (pErrorC, pRecordsC) =>
					{
						record('unsupported + short filter: GET fallback succeeds', !pErrorC && Array.isArray(pRecordsC) && pRecordsC.length === SEED_BOOKS.length,
							pErrorC ? pErrorC.message : `${pRecordsC && pRecordsC.length} records`);

						const tmpFailures = _Results.filter((pResult) => { return !pResult.OK; });
						// eslint-disable-next-line no-console
						console.log(`\n${_Results.length - tmpFailures.length}/${_Results.length} invariants passed.`);
						return finish(tmpFailures.length === 0 ? 0 : 1);
					});
				});
			});
		});
	});
};

main();
