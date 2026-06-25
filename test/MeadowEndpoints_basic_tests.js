/**
* Unit tests for Meadow Endpoints
*
* Uses SQLite (better-sqlite3) as the provider so no external database server
* is required.
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

var Chai = require("chai");
var Expect = Chai.expect;
var Assert = Chai.assert;

const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');
const libMeadow = require('meadow');
const libMeadowEndpoints = require('../source/Meadow-Endpoints.js');
const libMeadowConnectionSQLite = require('meadow-connection-sqlite');
const libSuperTest = require('supertest');

const _BookSchema = require('../test_support/model/meadow_schema/BookStore-MeadowSchema-Book.json');

// -- Shared state for the test suite --
let _Fable = false;
let _Orator = false;
let _Meadow = false;
let _MeadowEndpoints = false;
let _SuperTest = false;

// Keep track of the API server port
const _APIServerPort = 9876;
const _BaseURL = `http://localhost:${_APIServerPort}/`;

suite
(
	'Meadow-Endpoints',
	() =>
	{
		// Set up Fable + Orator + SQLite + Meadow + Endpoints before all tests
		suiteSetup
		(
			function (fDone)
			{
				this.timeout(30000);

				let tmpSettings = {
					Product: 'MeadowEndpointsTest',
					ProductVersion: '1.0.0',
					APIServerPort: _APIServerPort,
					SQLite:
					{
						SQLiteFilePath: ':memory:'
					},
					LogStreams:
					[
						{
							streamtype: 'console',
							level: 'fatal'
						}
					],
					MeadowEndpointsSessionDataSource: 'None'
				};

				_Fable = new libFable(tmpSettings);

				// Register the Restify service server so Orator uses it
				_Fable.serviceManager.addServiceType('OratorServiceServer', libOratorServiceServerRestify);

				// Register and instantiate the SQLite connection provider
				_Fable.serviceManager.addServiceType('MeadowSQLiteProvider', libMeadowConnectionSQLite);
				_Fable.serviceManager.instantiateServiceProvider('MeadowSQLiteProvider');

				_Fable.MeadowSQLiteProvider.connectAsync(
					(pError) =>
					{
						if (pError)
						{
							return fDone(pError);
						}

						let tmpDB = _Fable.MeadowSQLiteProvider.db;

						// Create the Book table
						tmpDB.exec(
							`CREATE TABLE IF NOT EXISTS Book (
								IDBook INTEGER PRIMARY KEY AUTOINCREMENT,
								GUIDBook TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
								CreateDate TEXT,
								CreatingIDUser INTEGER NOT NULL DEFAULT 0,
								UpdateDate TEXT,
								UpdatingIDUser INTEGER NOT NULL DEFAULT 0,
								Deleted INTEGER NOT NULL DEFAULT 0,
								DeleteDate TEXT,
								DeletingIDUser INTEGER NOT NULL DEFAULT 0,
								Title TEXT NOT NULL DEFAULT '',
								Type TEXT NOT NULL DEFAULT '',
								Genre TEXT NOT NULL DEFAULT '',
								ISBN TEXT NOT NULL DEFAULT '',
								Language TEXT NOT NULL DEFAULT '',
								ImageURL TEXT NOT NULL DEFAULT '',
								PublicationYear INTEGER NOT NULL DEFAULT 0
							);`
						);

						// Seed some test data
						let tmpInsert = tmpDB.prepare(
							`INSERT INTO Book (Title, Type, Genre, ISBN, Language, PublicationYear)
							 VALUES (?, ?, ?, ?, ?, ?)`
						);
						tmpInsert.run('Angels & Demons', 'Novel', 'Thriller', '978-0671027360', 'English', 2000);
						tmpInsert.run('Dune', 'Novel', 'Science Fiction', '978-0441013593', 'English', 1965);
						tmpInsert.run('Neuromancer', 'Novel', 'Science Fiction', '978-0441569595', 'English', 1984);
						tmpInsert.run('Snow Crash', 'Novel', 'Science Fiction', '978-0553380958', 'English', 1992);
						tmpInsert.run('The Da Vinci Code', 'Novel', 'Thriller', '978-0307474278', 'English', 2003);

						// Create the Meadow DAL and endpoints
						_Meadow = libMeadow.new(_Fable, 'Book')
							.setProvider('SQLite')
							.setSchema(_BookSchema.Schema)
							.setJsonSchema(_BookSchema.JsonSchema)
							.setDefaultIdentifier(_BookSchema.DefaultIdentifier)
							.setDefault(_BookSchema.DefaultObject);

						// Initialize Orator (creates and registers the Restify service server)
						_Orator = new libOrator(_Fable, {});
						_Orator.initialize(
							() =>
							{
								// Wire up the Meadow Endpoints
								_MeadowEndpoints = libMeadowEndpoints.new(_Meadow);
								_MeadowEndpoints.connectRoutes(_Orator.serviceServer);

								// Start listening for requests
								_Orator.startService(
									(pStartError) =>
									{
										if (pStartError)
										{
											return fDone(pStartError);
										}
										_SuperTest = libSuperTest(_BaseURL);
										return fDone();
									});
							});
					});
			}
		);

		suiteTeardown
		(
			function (fDone)
			{
				this.timeout(10000);
				if (_Fable && _Fable.MeadowSQLiteProvider && _Fable.MeadowSQLiteProvider.db)
				{
					try { _Fable.MeadowSQLiteProvider.db.close(); } catch (pIgnore) { /* ignore */ }
				}
				if (_Orator && _Orator.serviceServer && _Orator.serviceServer.Active && _Orator.serviceServer.server)
				{
					// Directly close the restify server to avoid hanging on keep-alive connections
					_Orator.serviceServer.server.close(() =>
					{
						_Orator.serviceServer.Active = false;
						fDone();
					});
				}
				else
				{
					fDone();
				}
			}
		);

		// ======================================================================
		// Object Sanity
		// ======================================================================
		suite
		(
			'Object Sanity',
			() =>
			{
				test
				(
					'The class should initialize itself into a happy little object.',
					function (fDone)
					{
						Expect(_MeadowEndpoints).to.be.an('object');
						Expect(_MeadowEndpoints.DAL).to.be.an('object');
						Expect(_MeadowEndpoints.DAL.scope).to.equal('Book');
						Expect(_MeadowEndpoints.controller).to.be.an('object');
						fDone();
					}
				);
				test
				(
					'The constructor should throw without a valid Meadow DAL.',
					function (fDone)
					{
						Expect(() => { new libMeadowEndpoints(); }).to.throw();
						fDone();
					}
				);
				test
				(
					'The MeadowEndpoints class should expose Meadow and BaseController.',
					function (fDone)
					{
						Expect(libMeadowEndpoints.Meadow).to.be.an('object');
						Expect(libMeadowEndpoints.Meadow.new).to.be.a('function');
						Expect(libMeadowEndpoints.BaseController).to.be.a('function');
						Expect(libMeadowEndpoints.new).to.be.a('function');
						fDone();
					}
				);
				test
				(
					'The endpoint version and prefix should be configured.',
					function (fDone)
					{
						Expect(_MeadowEndpoints.EndpointVersion).to.equal('1.0');
						Expect(_MeadowEndpoints.EndpointName).to.equal('Book');
						Expect(_MeadowEndpoints.EndpointPrefix).to.equal('/1.0/Book');
						fDone();
					}
				);
				test
				(
					'Behavior sets should all be enabled by default.',
					function (fDone)
					{
						Expect(_MeadowEndpoints._EnabledBehaviorSets.Create).to.equal(true);
						Expect(_MeadowEndpoints._EnabledBehaviorSets.Read).to.equal(true);
						Expect(_MeadowEndpoints._EnabledBehaviorSets.Reads).to.equal(true);
						Expect(_MeadowEndpoints._EnabledBehaviorSets.Update).to.equal(true);
						Expect(_MeadowEndpoints._EnabledBehaviorSets.Delete).to.equal(true);
						Expect(_MeadowEndpoints._EnabledBehaviorSets.Count).to.equal(true);
						Expect(_MeadowEndpoints._EnabledBehaviorSets.Schema).to.equal(true);
						fDone();
					}
				);
			}
		);

		// ======================================================================
		// Create Endpoints
		// ======================================================================
		suite
		(
			'Create',
			() =>
			{
				test
				(
					'create: create a single record',
					function (fDone)
					{
						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Batman is Batman', Genre: 'Comic', PublicationYear: 1939 })
							.end(
								(pError, pResponse) =>
								{
									Expect(pError).to.not.exist;
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Title).to.equal('Batman is Batman');
									Expect(tmpResult.Genre).to.equal('Comic');
									Expect(tmpResult.PublicationYear).to.equal(1939);
									Expect(tmpResult.IDBook).to.be.above(0);
									Expect(tmpResult.GUIDBook).to.be.a('string');
									Expect(tmpResult.Deleted).to.equal(0);
									fDone();
								}
							);
					}
				);
				test
				(
					'create: create a record with minimal fields',
					function (fDone)
					{
						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Minimal Book' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Title).to.equal('Minimal Book');
									Expect(tmpResult.IDBook).to.be.above(0);
									fDone();
								}
							);
					}
				);
				test
				(
					'create: should handle an empty body gracefully',
					function (fDone)
					{
						_SuperTest
							.post('1.0/Book')
							.send({})
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									// An empty body should still create a record with defaults
									Expect(tmpResult.IDBook).to.be.above(0);
									Expect(tmpResult.Title).to.equal('');
									fDone();
								}
							);
					}
				);
				test
				(
					'create bulk: create multiple records',
					function (fDone)
					{
						_SuperTest
							.post('1.0/Books')
							.send([
								{ Title: 'Bulk Book A', Genre: 'Fantasy' },
								{ Title: 'Bulk Book B', Genre: 'Romance' },
								{ Title: 'Bulk Book C', Genre: 'Horror' }
							])
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(3);
									Expect(tmpResult[0].Title).to.equal('Bulk Book A');
									Expect(tmpResult[1].Title).to.equal('Bulk Book B');
									Expect(tmpResult[2].Title).to.equal('Bulk Book C');
									fDone();
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// Read Endpoints
		// ======================================================================
		suite
		(
			'Read',
			() =>
			{
				test
				(
					'read: get a specific record by ID',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Book/1')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(1);
									Expect(tmpResult.Title).to.equal('Angels & Demons');
									fDone();
								}
							);
					}
				);
				test
				(
					'read: get a second record by ID',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Book/2')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(2);
									Expect(tmpResult.Title).to.equal('Dune');
									fDone();
								}
							);
					}
				);
				test
				(
					'read: get a record that does not exist',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Book/99999')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									// Should return an error
									Expect(tmpResult).to.have.property('Error');
									fDone();
								}
							);
					}
				);
				test
				(
					'reads: get all records with default pagination',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									// We seeded 5 + created ~4 in prior tests
									Expect(tmpResult.length).to.be.at.least(5);
									fDone();
								}
							);
					}
				);
				test
				(
					'reads: get records with pagination',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/0/2')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(2);
									Expect(tmpResult[0].IDBook).to.equal(1);
									fDone();
								}
							);
					}
				);
				test
				(
					'reads: get records with offset pagination',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/2/2')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(2);
									Expect(tmpResult[0].IDBook).to.equal(3);
									fDone();
								}
							);
					}
				);
				test
				(
					'reads: get records with filter (contains)',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/FilteredTo/FBV~Genre~LK~%25Science%25')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.be.at.least(3);
									tmpResult.forEach((pRecord) =>
									{
										Expect(pRecord.Genre).to.contain('Science');
									});
									fDone();
								}
							);
					}
				);
				test
				(
					'reads: get records with filter and pagination',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/FilteredTo/FBV~Genre~LK~%25Science%25/0/1')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(1);
									Expect(tmpResult[0].Genre).to.contain('Science');
									fDone();
								}
							);
					}
				);
				test
				(
					"query: reads all records via JSON body (default mode)",
					function (fDone)
					{
						_SuperTest
							.post("1.0/Books/Query")
							.send({})
							.end(
								(pError, pResponse) =>
								{
									Expect(pError).to.not.exist;
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an("array");
									Expect(tmpResult.length).to.be.at.least(5);
									fDone();
								}
							);
					}
				);
				test
				(
					"query: reads with filter and pagination in the body",
					function (fDone)
					{
						_SuperTest
							.post("1.0/Books/Query")
							.send({ Filter: "FBV~Genre~LK~%Science%", Begin: 0, Cap: 1 })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an("array");
									Expect(tmpResult.length).to.equal(1);
									Expect(tmpResult[0].Genre).to.contain("Science");
									fDone();
								}
							);
					}
				);
				test
				(
					"query: Lite read via boolean flag",
					function (fDone)
					{
						_SuperTest
							.post("1.0/Books/Query")
							.send({ Lite: true, Begin: 0, Cap: 3 })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an("array");
									Expect(tmpResult.length).to.equal(3);
									fDone();
								}
							);
					}
				);
				test
				(
					"query: Distinct read via boolean flag and Columns",
					function (fDone)
					{
						_SuperTest
							.post("1.0/Books/Query")
							.send({ Distinct: true, Columns: "Genre" })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an("array");
									Expect(tmpResult.length).to.be.at.least(1);
									fDone();
								}
							);
					}
				);
				test
				(
					"query: Count flag takes precedence and honors the filter",
					function (fDone)
					{
						_SuperTest
							.post("1.0/Books/Query")
							.send({ Lite: true, Count: true, Filter: "FBV~Genre~LK~%Science%" })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property("Count");
									Expect(tmpResult.Count).to.be.at.least(3);
									fDone();
								}
							);
					}
				);
				test
				(
					'reads by: get records filtered by a field value',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/By/Genre/Thriller')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.be.at.least(2);
									tmpResult.forEach((pRecord) =>
									{
										Expect(pRecord.Genre).to.equal('Thriller');
									});
									fDone();
								}
							);
					}
				);
				test
				(
					'reads by: with pagination',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/By/Genre/Thriller/0/1')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(1);
									Expect(tmpResult[0].Genre).to.equal('Thriller');
									fDone();
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// Specialized Read Endpoints
		// ======================================================================
		suite
		(
			'Specialized Read',
			() =>
			{
				test
				(
					'select list: get Hash/Value pairs',
					function (fDone)
					{
						_SuperTest
							.get('1.0/BookSelect')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.be.at.least(5);
									Expect(tmpResult[0]).to.have.property('Hash');
									Expect(tmpResult[0]).to.have.property('Value');
									fDone();
								}
							);
					}
				);
				test
				(
					'select list: with pagination',
					function (fDone)
					{
						_SuperTest
							.get('1.0/BookSelect/0/2')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(2);
									fDone();
								}
							);
					}
				);
				test
				(
					'select list: with filter',
					function (fDone)
					{
						_SuperTest
							.get('1.0/BookSelect/FilteredTo/FBV~Genre~EQ~Thriller')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.be.at.least(2);
									tmpResult.forEach((pRecord) =>
									{
										Expect(pRecord).to.have.property('Hash');
										Expect(pRecord).to.have.property('Value');
									});
									fDone();
								}
							);
					}
				);
				test
				(
					'lite list: get minimal columns',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/Lite')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.be.at.least(5);
									fDone();
								}
							);
					}
				);
				test
				(
					'lite list: with pagination',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/Lite/0/3')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(3);
									fDone();
								}
							);
					}
				);
				test
				(
					'max: get the maximum value for a column',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Book/Max/PublicationYear')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									// ReadMax returns a single record (not an array)
									Expect(tmpResult).to.be.an('object');
									Expect(tmpResult).to.have.property('PublicationYear');
									// The max publication year in our seed data is 2003
									Expect(tmpResult.PublicationYear).to.be.at.least(2003);
									fDone();
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// Update Endpoints
		// ======================================================================
		suite
		(
			'Update',
			() =>
			{
				test
				(
					'update: update a single record',
					function (fDone)
					{
						_SuperTest
							.put('1.0/Book')
							.send({ IDBook: 1, Title: 'Angels & Demons (Updated)' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(1);
									Expect(tmpResult.Title).to.equal('Angels & Demons (Updated)');
									fDone();
								}
							);
					}
				);
				test
				(
					'update: verify the update persisted',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Book/1')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Title).to.equal('Angels & Demons (Updated)');
									fDone();
								}
							);
					}
				);
				test
				(
					'update: fail without a valid record ID',
					function (fDone)
					{
						_SuperTest
							.put('1.0/Book')
							.send({ Title: 'No ID Provided' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Error');
									fDone();
								}
							);
					}
				);
				test
				(
					'update: fail for a non-existent record',
					function (fDone)
					{
						_SuperTest
							.put('1.0/Book')
							.send({ IDBook: 99999, Title: 'Ghost Record' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Error');
									fDone();
								}
							);
					}
				);
				test
				(
					'bulk update: update multiple records',
					function (fDone)
					{
						_SuperTest
							.put('1.0/Books')
							.send([
								{ IDBook: 2, Title: 'Dune (Updated)' },
								{ IDBook: 3, Title: 'Neuromancer (Updated)' }
							])
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									Expect(tmpResult.length).to.equal(2);
									Expect(tmpResult[0].Title).to.equal('Dune (Updated)');
									Expect(tmpResult[1].Title).to.equal('Neuromancer (Updated)');
									fDone();
								}
							);
					}
				);
				test
				(
					'upsert: update an existing record via upsert',
					function (fDone)
					{
						_SuperTest
							.put('1.0/Book/Upsert')
							.send({ IDBook: 4, Title: 'Snow Crash (Upserted)' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(4);
									Expect(tmpResult.Title).to.equal('Snow Crash (Upserted)');
									fDone();
								}
							);
					}
				);
				test
				(
					'upsert: create a new record via upsert',
					function (fDone)
					{
						_SuperTest
							.put('1.0/Book/Upsert')
							.send({ IDBook: 0, Title: 'Upserted New Book', Genre: 'Upsert' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Title).to.equal('Upserted New Book');
									Expect(tmpResult.IDBook).to.be.above(0);
									fDone();
								}
							);
					}
				);
				test
				(
					'upsert: update by GUID when passed ID is zero',
					function (fDone)
					{
						// First create a record so we have a known GUID
						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Zero ID Upsert Test', Genre: 'Test' })
							.end(
								(pError, pResponse) =>
								{
									let tmpCreated = JSON.parse(pResponse.text);
									let tmpRecord = Array.isArray(tmpCreated) ? tmpCreated[0] : tmpCreated;
									let tmpGUID = tmpRecord.GUIDBook;
									let tmpID = tmpRecord.IDBook;
									Expect(tmpID).to.be.above(0);
									Expect(tmpGUID).to.be.a('string');

									// Now upsert with ID=0 but the same GUID — should
									// find the record by GUID and update it, not fail
									// with "Record IDs do not match".
									_SuperTest
										.put('1.0/Book/Upsert')
										.send({ IDBook: 0, GUIDBook: tmpGUID, Title: 'Zero ID Upsert Updated' })
										.end(
											(pUpsertError, pUpsertResponse) =>
											{
												Expect(pUpsertResponse.status).to.equal(200);
												let tmpResult = JSON.parse(pUpsertResponse.text);
												Expect(tmpResult.IDBook).to.equal(tmpID);
												Expect(tmpResult.Title).to.equal('Zero ID Upsert Updated');
												fDone();
											}
										);
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// Delete Endpoints
		// ======================================================================
		suite
		(
			'Delete',
			() =>
			{
				let _DeletedRecordID = 0;

				test
				(
					'delete: create a record to delete',
					function (fDone)
					{
						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'To Be Deleted', Genre: 'Temp' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									_DeletedRecordID = tmpResult.IDBook;
									Expect(_DeletedRecordID).to.be.above(0);
									fDone();
								}
							);
					}
				);
				test
				(
					'delete: delete a record by URL parameter',
					function (fDone)
					{
						_SuperTest
							.delete(`1.0/Book/${_DeletedRecordID}`)
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Count');
									Expect(tmpResult.Count).to.equal(1);
									fDone();
								}
							);
					}
				);
				test
				(
					'delete: the deleted record should not be readable',
					function (fDone)
					{
						_SuperTest
							.get(`1.0/Book/${_DeletedRecordID}`)
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									// Record should not be found (soft-deleted)
									Expect(tmpResult).to.have.property('Error');
									fDone();
								}
							);
					}
				);
				test
				(
					'undelete: restore a soft-deleted record',
					function (fDone)
					{
						_SuperTest
							.get(`1.0/Book/Undelete/${_DeletedRecordID}`)
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Count');
									Expect(tmpResult.Count).to.equal(1);
									fDone();
								}
							);
					}
				);
				test
				(
					'undelete: the restored record should be readable again',
					function (fDone)
					{
						_SuperTest
							.get(`1.0/Book/${_DeletedRecordID}`)
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(_DeletedRecordID);
									Expect(tmpResult.Title).to.equal('To Be Deleted');
									fDone();
								}
							);
					}
				);
				test
				(
					'delete: delete and verify zero count for non-existent ID',
					function (fDone)
					{
						_SuperTest
							.delete('1.0/Book/99999')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									// Non-existent record should error
									Expect(tmpResult).to.have.property('Error');
									fDone();
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// Count Endpoints
		// ======================================================================
		suite
		(
			'Count',
			() =>
			{
				test
				(
					'count: get total record count',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/Count')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Count');
									Expect(tmpResult.Count).to.be.at.least(5);
									fDone();
								}
							);
					}
				);
				test
				(
					'count by: count by a field value',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/Count/By/Genre/Thriller')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Count');
									Expect(tmpResult.Count).to.be.at.least(2);
									fDone();
								}
							);
					}
				);
				test
				(
					'count: count with filter',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/Count/FilteredTo/FBV~Genre~LK~%25Science%25')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Count');
									Expect(tmpResult.Count).to.be.at.least(3);
									fDone();
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// Schema Endpoints
		// ======================================================================
		suite
		(
			'Schema',
			() =>
			{
				test
				(
					'schema: get the JSON schema',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Book/Schema')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('title');
									Expect(tmpResult.title).to.equal('Book');
									Expect(tmpResult).to.have.property('properties');
									Expect(tmpResult.properties).to.have.property('IDBook');
									Expect(tmpResult.properties).to.have.property('Title');
									Expect(tmpResult.properties).to.have.property('Genre');
									fDone();
								}
							);
					}
				);
				test
				(
					'schema: advertises RetoldMetadata version map and capabilities',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Book/Schema')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('RetoldMetadata');
									Expect(tmpResult.RetoldMetadata).to.have.property('PackageVersions');
									Expect(tmpResult.RetoldMetadata.PackageVersions).to.have.property('meadow-endpoints');
									// The deployed version should report itself; meadow is a hard dependency.
									Expect(tmpResult.RetoldMetadata.PackageVersions['meadow-endpoints']).to.be.a('string');
									Expect(tmpResult.RetoldMetadata.PackageVersions).to.have.property('meadow');
									Expect(tmpResult.RetoldMetadata).to.have.property('Capabilities');
									Expect(tmpResult.RetoldMetadata.Capabilities.QueryEndpoint).to.equal(true);
									fDone();
								}
							);
					}
				);
				test
				(
					'new: get a default empty record',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Book/Schema/New')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('IDBook');
									Expect(tmpResult.IDBook).to.equal(0);
									Expect(tmpResult).to.have.property('Title');
									Expect(tmpResult.Title).to.equal('');
									Expect(tmpResult).to.have.property('PublicationYear');
									Expect(tmpResult.PublicationYear).to.equal(0);
									fDone();
								}
							);
					}
				);
				test
				(
					'validate: validate a valid record',
					function (fDone)
					{
						_SuperTest
							.post('1.0/Book/Schema/Validate')
							.send({
								IDBook: 1,
								Title: 'Test Book',
								Genre: 'Test'
							})
							.end(
								(pError, pResponse) =>
								{
									// Validation should succeed
									Expect(pResponse.status).to.equal(200);
									fDone();
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// Behavior Injection
		// ======================================================================
		suite
		(
			'Behavior Injection',
			() =>
			{
				test
				(
					'setBehavior: register and trigger a Read-PostOperation hook',
					function (fDone)
					{
						// Register a post-read hook that adds a custom field
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Read-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								pRequestState.Record.CustomField = 'injected';
								return fCallback();
							});

						_SuperTest
							.get('1.0/Book/1')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.CustomField).to.equal('injected');

									// Clean up the behavior
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Read-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: register and trigger a Reads-QueryConfiguration hook',
					function (fDone)
					{
						// Register a query config hook that limits to Genre=Thriller
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Reads-QueryConfiguration',
							(pRequest, pRequestState, fCallback) =>
							{
								pRequestState.Query.addFilter('Genre', 'Thriller');
								return fCallback();
							});

						_SuperTest
							.get('1.0/Books')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.be.an('array');
									tmpResult.forEach((pRecord) =>
									{
										Expect(pRecord.Genre).to.equal('Thriller');
									});

									// Clean up the behavior
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Reads-QueryConfiguration'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Create-PreOperation hook can modify the record',
					function (fDone)
					{
						// Register a pre-create hook that sets a default genre
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Create-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								if (!pRequestState.RecordToCreate.Genre || pRequestState.RecordToCreate.Genre === '')
								{
									pRequestState.RecordToCreate.Genre = 'DefaultGenre';
								}
								return fCallback();
							});

						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Hook Default Genre' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Genre).to.equal('DefaultGenre');

									// Clean up
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Create-PreOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Create-PreOperation hook can reject a request',
					function (fDone)
					{
						// Register a pre-create hook that rejects records without a title
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Create-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								if (!pRequestState.RecordToCreate.Title || pRequestState.RecordToCreate.Title === '')
								{
									let tmpError = new Error('Title is required');
									tmpError.StatusCode = 400;
									return fCallback(tmpError);
								}
								return fCallback();
							});

						_SuperTest
							.post('1.0/Book')
							.send({ Genre: 'No Title Provided' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Error');

									// Clean up
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Create-PreOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Delete-PreOperation hook can prevent deletion',
					function (fDone)
					{
						// Register a pre-delete hook that blocks deletion
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Delete-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								let tmpError = new Error('Deletion is blocked');
								tmpError.StatusCode = 403;
								return fCallback(tmpError);
							});

						_SuperTest
							.delete('1.0/Book/1')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Error');

									// Clean up
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Delete-PreOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Count-QueryConfiguration hook modifies count query',
					function (fDone)
					{
						// Register a hook that adds a filter to the count query
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Count-QueryConfiguration',
							(pRequest, pRequestState, fCallback) =>
							{
								pRequestState.Query.addFilter('Genre', 'Thriller');
								return fCallback();
							});

						_SuperTest
							.get('1.0/Books/Count')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Count).to.be.at.least(1);
									// The count should be less than total records
									Expect(tmpResult.Count).to.be.below(20);

									// Clean up
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Count-QueryConfiguration'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Schema-PostOperation hook can modify schema',
					function (fDone)
					{
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Schema-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								if (pRequestState.JSONSchema && pRequestState.JSONSchema.properties)
								{
									pRequestState.JSONSchema.customMeta = 'injected-metadata';
								}
								return fCallback();
							});

						_SuperTest
							.get('1.0/Book/Schema')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.customMeta).to.equal('injected-metadata');

									// Clean up
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Schema-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: New-PostOperation hook can modify defaults',
					function (fDone)
					{
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('New-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								pRequestState.EmptyEntityRecord.Genre = 'DefaultFromHook';
								pRequestState.EmptyEntityRecord.Language = 'English';
								return fCallback();
							});

						_SuperTest
							.get('1.0/Book/Schema/New')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Genre).to.equal('DefaultFromHook');
									Expect(tmpResult.Language).to.equal('English');

									// Clean up
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['New-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Update-PostOperation hook runs after update',
					function (fDone)
					{
						let _HookCalled = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Update-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_HookCalled = true;
								pRequestState.Record.HookWasHere = true;
								return fCallback();
							});

						_SuperTest
							.put('1.0/Book')
							.send({ IDBook: 5, Title: 'The Da Vinci Code (Hooked)' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(_HookCalled).to.equal(true);
									Expect(tmpResult.Title).to.equal('The Da Vinci Code (Hooked)');

									// Clean up
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Update-PostOperation'];
									fDone();
								}
							);
					}
				);

				// ==================================================================
				// New hooks added 2026-04-18 to restore ME2 parity
				// (Update-Pre, Update-Query) and to extend ME4's bulk-level hooks
				// to Update/Upsert (UpdateBulk-*, UpsertBulk-*).
				// ==================================================================

				test
				(
					'setBehavior: Update-PreOperation hook can mutate RecordToModify before DAL update',
					function (fDone)
					{
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Update-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								// Hook sees the incoming payload on RecordToModify,
								// existing loaded row on Record. Mutations to
								// RecordToModify flow through to the DAL update.
								Expect(pRequestState.RecordToModify).to.be.an('object');
								pRequestState.RecordToModify.Genre = 'MutatedByPreOp';
								return fCallback();
							});

						_SuperTest
							.put('1.0/Book')
							.send({ IDBook: 4, Title: 'Snow Crash (v2)' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Genre).to.equal('MutatedByPreOp');
									Expect(tmpResult.Title).to.equal('Snow Crash (v2)');

									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Update-PreOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Update-PreOperation hook can reject an update',
					function (fDone)
					{
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Update-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								if (!pRequestState.RecordToModify.Title)
								{
									const tmpError = new Error('Title is required');
									tmpError.StatusCode = 400;
									return fCallback(tmpError);
								}
								return fCallback();
							});

						_SuperTest
							.put('1.0/Book')
							.send({ IDBook: 3 })
							.end(
								(pError, pResponse) =>
								{
									const tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Error');

									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Update-PreOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Update-QueryConfiguration hook fires after Query.addRecord',
					function (fDone)
					{
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Update-QueryConfiguration',
							(pRequest, pRequestState, fCallback) =>
							{
								// Query should exist and have had the record added;
								// hook can scope the update further.
								Expect(pRequestState.Query).to.exist;
								pRequestState.Query.addFilter('Deleted', 0);
								return fCallback();
							});

						_SuperTest
							.put('1.0/Book')
							.send({ IDBook: 2, Title: 'Dune (updated)' })
							.end(
								(pError, pResponse) =>
								{
									const tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Title).to.equal('Dune (updated)');

									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Update-QueryConfiguration'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: UpdateBulk-PreOperation fires once before the batch',
					function (fDone)
					{
						let _CallCount = 0;
						let _SawBulkRecords = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('UpdateBulk-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_CallCount++;
								_SawBulkRecords = Array.isArray(pRequestState.BulkRecords);
								return fCallback();
							});

						_SuperTest
							.put('1.0/Books')
							.send([
								{ IDBook: 1, Title: 'Angels & Demons (batch)' },
								{ IDBook: 2, Title: 'Dune (batch)' },
							])
							.end(
								(pError, pResponse) =>
								{
									Expect(_CallCount).to.equal(1);
									Expect(_SawBulkRecords).to.equal(true);

									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['UpdateBulk-PreOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: UpdateBulk-PostOperation fires once after the batch',
					function (fDone)
					{
						let _CallCount = 0;
						let _SawUpdatedRecords = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('UpdateBulk-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_CallCount++;
								_SawUpdatedRecords = Array.isArray(pRequestState.UpdatedRecords) && pRequestState.UpdatedRecords.length > 0;
								return fCallback();
							});

						_SuperTest
							.put('1.0/Books')
							.send([
								{ IDBook: 3, Title: 'Neuromancer (batch post)' },
							])
							.end(
								(pError, pResponse) =>
								{
									Expect(_CallCount).to.equal(1);
									Expect(_SawUpdatedRecords).to.equal(true);

									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['UpdateBulk-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: UpsertBulk-PreOperation fires once before the batch',
					function (fDone)
					{
						let _CallCount = 0;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('UpsertBulk-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_CallCount++;
								Expect(Array.isArray(pRequestState.BulkRecords)).to.equal(true);
								return fCallback();
							});

						_SuperTest
							.put('1.0/Book/Upserts')
							.send([
								{ Title: 'Bulk Upsert New 1' },
								{ Title: 'Bulk Upsert New 2' },
							])
							.end(
								(pError, pResponse) =>
								{
									Expect(_CallCount).to.equal(1);

									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['UpsertBulk-PreOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: UpsertBulk-PostOperation fires once after the batch',
					function (fDone)
					{
						let _CallCount = 0;
						let _SawUpserted = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('UpsertBulk-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_CallCount++;
								_SawUpserted = Array.isArray(pRequestState.UpsertedRecords) && pRequestState.UpsertedRecords.length > 0;
								return fCallback();
							});

						_SuperTest
							.put('1.0/Book/Upserts')
							.send([
								{ Title: 'Bulk Upsert Post 1' },
							])
							.end(
								(pError, pResponse) =>
								{
									Expect(_CallCount).to.equal(1);
									Expect(_SawUpserted).to.equal(true);

									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['UpsertBulk-PostOperation'];
									fDone();
								}
							);
					}
				);

				// ==================================================================
				// Coverage backfill for hooks that were present but previously
				// untested. Each test registers a handler, fires the endpoint,
				// and asserts the hook observed the expected state. These also
				// act as stage-semantics documentation for the hook surface.
				// ==================================================================

				test
				(
					'setBehavior: Create-QueryConfiguration fires after Query.addRecord',
					function (fDone)
					{
						let _Seen = null;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Create-QueryConfiguration',
							(pRequest, pRequestState, fCallback) =>
							{
								_Seen = {
									hasQuery: !!pRequestState.Query,
									hasRecordToCreate: !!pRequestState.RecordToCreate,
								};
								return fCallback();
							});

						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Query-Config hook target' })
							.end(
								(pError, pResponse) =>
								{
									Expect(_Seen).to.deep.equal({ hasQuery: true, hasRecordToCreate: true });

									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Create-QueryConfiguration'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Create-PostOperation sees the freshly-inserted Record',
					function (fDone)
					{
						let _SeenIDBook = null;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Create-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_SeenIDBook = pRequestState.Record && pRequestState.Record.IDBook;
								pRequestState.Record.PostOpTag = 'was-here';
								return fCallback();
							});

						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Post-op hook target' })
							.end(
								(pError, pResponse) =>
								{
									const tmpResult = JSON.parse(pResponse.text);
									Expect(_SeenIDBook).to.be.above(0);
									Expect(tmpResult.PostOpTag).to.equal('was-here');

									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Create-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: CreateBulk-PreOperation fires once with RecordsToBulkCreate',
					function (fDone)
					{
						let _CallCount = 0;
						let _SawRecords = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('CreateBulk-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_CallCount++;
								_SawRecords = Array.isArray(pRequest.RecordsToBulkCreate);
								return fCallback();
							});

						_SuperTest
							.post('1.0/Books')
							.send([
								{ Title: 'Bulk Create 1' },
								{ Title: 'Bulk Create 2' },
							])
							.end(
								(pError, pResponse) =>
								{
									Expect(_CallCount).to.equal(1);
									Expect(_SawRecords).to.equal(true);

									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['CreateBulk-PreOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: CreateBulk-PostOperation fires once with CreatedRecords',
					function (fDone)
					{
						let _SawCreated = null;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('CreateBulk-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_SawCreated = Array.isArray(pRequestState.CreatedRecords) && pRequestState.CreatedRecords.length;
								return fCallback();
							});

						_SuperTest
							.post('1.0/Books')
							.send([
								{ Title: 'Bulk Create Post 1' },
							])
							.end(
								(pError, pResponse) =>
								{
									Expect(_SawCreated).to.equal(1);

									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['CreateBulk-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Delete-QueryConfiguration can scope the delete query',
					function (fDone)
					{
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Delete-QueryConfiguration',
							(pRequest, pRequestState, fCallback) =>
							{
								Expect(pRequestState.Query).to.exist;
								return fCallback();
							});

						// Use a record we don't care about the state of; create one inline.
						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Delete-Query target' })
							.end(
								(pPostErr, pPostRes) =>
								{
									const tmpID = JSON.parse(pPostRes.text).IDBook;
									_SuperTest
										.delete(`1.0/Book/${tmpID}`)
										.end(
											(pDelErr, pDelRes) =>
											{
												delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Delete-QueryConfiguration'];
												fDone();
											}
										);
								}
							);
					}
				);
				test
				(
					'setBehavior: Delete-PostOperation fires after soft-delete',
					function (fDone)
					{
						let _HookFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Delete-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_HookFired = true;
								return fCallback();
							});

						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Delete-Post target' })
							.end(
								(pPostErr, pPostRes) =>
								{
									const tmpID = JSON.parse(pPostRes.text).IDBook;
									_SuperTest
										.delete(`1.0/Book/${tmpID}`)
										.end(
											() =>
											{
												Expect(_HookFired).to.equal(true);
												delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Delete-PostOperation'];
												fDone();
											}
										);
								}
							);
					}
				);
				test
				(
					'setBehavior: Read-QueryConfiguration runs after filter is applied',
					function (fDone)
					{
						let _SeenCriteria = null;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Read-QueryConfiguration',
							(pRequest, pRequestState, fCallback) =>
							{
								_SeenCriteria = pRequestState.RecordSearchCriteria;
								return fCallback();
							});

						_SuperTest
							.get('1.0/Book/1')
							.end(
								() =>
								{
									Expect(_SeenCriteria).to.be.a('string').and.satisfy((pS) => pS.includes('IDBook'));
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Read-QueryConfiguration'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Reads-PostOperation fires after list load',
					function (fDone)
					{
						let _SawRecords = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Reads-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_SawRecords = Array.isArray(pRequestState.Records) && pRequestState.Records.length > 0;
								return fCallback();
							});

						_SuperTest
							.get('1.0/Books/0/10')
							.end(
								() =>
								{
									Expect(_SawRecords).to.equal(true);
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Reads-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: ReadMax-QueryConfiguration fires with column name',
					function (fDone)
					{
						let _SeenColumn = null;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('ReadMax-QueryConfiguration',
							(pRequest, pRequestState, fCallback) =>
							{
								_SeenColumn = pRequestState.ColumnName;
								return fCallback();
							});

						_SuperTest
							.get('1.0/Book/Max/PublicationYear')
							.end(
								() =>
								{
									Expect(_SeenColumn).to.equal('PublicationYear');
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['ReadMax-QueryConfiguration'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: ReadMax-PostOperation fires after max lookup',
					function (fDone)
					{
						let _HookFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('ReadMax-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_HookFired = true;
								return fCallback();
							});

						_SuperTest
							.get('1.0/Book/Max/PublicationYear')
							.end(
								() =>
								{
									Expect(_HookFired).to.equal(true);
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['ReadMax-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: CountBy-QueryConfiguration can modify count-by query',
					function (fDone)
					{
						let _HookFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('CountBy-QueryConfiguration',
							(pRequest, pRequestState, fCallback) =>
							{
								_HookFired = true;
								Expect(pRequestState.Query).to.exist;
								return fCallback();
							});

						_SuperTest
							.get('1.0/Books/Count/By/Genre/Thriller')
							.end(
								() =>
								{
									Expect(_HookFired).to.equal(true);
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['CountBy-QueryConfiguration'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Undelete-PreOperation fires before undelete',
					function (fDone)
					{
						let _HookFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Undelete-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_HookFired = true;
								return fCallback();
							});

						// Create, delete, then undelete to hit the hook.
						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Undelete-Pre target' })
							.end(
								(pPostErr, pPostRes) =>
								{
									const tmpID = JSON.parse(pPostRes.text).IDBook;
									_SuperTest
										.delete(`1.0/Book/${tmpID}`)
										.end(
											() =>
											{
												_SuperTest
													.get(`1.0/Book/Undelete/${tmpID}`)
													.end(
														() =>
														{
															Expect(_HookFired).to.equal(true);
															delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Undelete-PreOperation'];
															fDone();
														}
													);
											}
										);
								}
							);
					}
				);
				test
				(
					'setBehavior: Undelete-PostOperation fires after undelete',
					function (fDone)
					{
						let _HookFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Undelete-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_HookFired = true;
								return fCallback();
							});

						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Undelete-Post target' })
							.end(
								(pPostErr, pPostRes) =>
								{
									const tmpID = JSON.parse(pPostRes.text).IDBook;
									_SuperTest
										.delete(`1.0/Book/${tmpID}`)
										.end(
											() =>
											{
												_SuperTest
													.get(`1.0/Book/Undelete/${tmpID}`)
													.end(
														() =>
														{
															Expect(_HookFired).to.equal(true);
															delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Undelete-PostOperation'];
															fDone();
														}
													);
											}
										);
								}
							);
					}
				);
				test
				(
					'setBehavior: Schema-PreOperation fires before schema render',
					function (fDone)
					{
						let _HookFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Schema-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_HookFired = true;
								return fCallback();
							});

						_SuperTest
							.get('1.0/Book/Schema')
							.end(
								() =>
								{
									Expect(_HookFired).to.equal(true);
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Schema-PreOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Validate-PreOperation fires before validate',
					function (fDone)
					{
						let _HookFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Validate-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_HookFired = true;
								return fCallback();
							});

						_SuperTest
							.post('1.0/Book/Schema/Validate')
							.send({ Title: 'Validate target' })
							.end(
								() =>
								{
									Expect(_HookFired).to.equal(true);
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Validate-PreOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Validate-PostOperation fires after validate',
					function (fDone)
					{
						let _HookFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Validate-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_HookFired = true;
								return fCallback();
							});

						_SuperTest
							.post('1.0/Book/Schema/Validate')
							.send({ Title: 'Validate target 2' })
							.end(
								() =>
								{
									Expect(_HookFired).to.equal(true);
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Validate-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: New-PreOperation fires before empty record render',
					function (fDone)
					{
						let _HookFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('New-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								_HookFired = true;
								return fCallback();
							});

						_SuperTest
							.get('1.0/Book/Schema/New')
							.end(
								() =>
								{
									Expect(_HookFired).to.equal(true);
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['New-PreOperation'];
									fDone();
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// Session Management
		// ======================================================================
		suite
		(
			'Session Management',
			() =>
			{
				test
				(
					'header session: use x-trusted-session header',
					function (fDone)
					{
						// Temporarily switch session source
						let tmpOriginalSource = _MeadowEndpoints.controller.settings.MeadowEndpointsSessionDataSource;
						_MeadowEndpoints.controller.settings.MeadowEndpointsSessionDataSource = 'Header';

						let tmpHookTriggered = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Read-PreOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								tmpHookTriggered = true;
								Expect(pRequestState.SessionData.UserID).to.equal(42);
								Expect(pRequestState.SessionData.CustomerID).to.equal(100);
								return fCallback();
							});

						_SuperTest
							.get('1.0/Book/1')
							.set('x-trusted-session', JSON.stringify({ UserID: 42, CustomerID: 100 }))
							.end(
								(pError, pResponse) =>
								{
									Expect(tmpHookTriggered).to.equal(true);

									// Clean up
									_MeadowEndpoints.controller.settings.MeadowEndpointsSessionDataSource = tmpOriginalSource;
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Read-PreOperation'];
									fDone();
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// Endpoint Configuration
		// ======================================================================
		suite
		(
			'Endpoint Configuration',
			() =>
			{
				test
				(
					'setBehaviorEndpoint: should accept custom endpoint functions',
					function (fDone)
					{
						// setBehaviorEndpoint should be a function and accept a custom function
						Expect(_MeadowEndpoints.setBehaviorEndpoint).to.be.a('function');
						let tmpResult = _MeadowEndpoints.setBehaviorEndpoint('CustomEndpoint', function () {});
						Expect(tmpResult).to.equal(_MeadowEndpoints); // Should return this for chaining
						fDone();
					}
				);
				test
				(
					'setBehaviorEndpoint: should ignore non-function endpoints',
					function (fDone)
					{
						let tmpResult = _MeadowEndpoints.setBehaviorEndpoint('BadEndpoint', 'not a function');
						Expect(tmpResult).to.equal(_MeadowEndpoints);
						fDone();
					}
				);
			}
		);

		// ======================================================================
		// Full CRUD Lifecycle
		// ======================================================================
		suite
		(
			'Full CRUD Lifecycle',
			() =>
			{
				let _LifecycleRecordID = 0;

				test
				(
					'lifecycle: create a record',
					function (fDone)
					{
						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Lifecycle Test', Genre: 'Test', ISBN: '000-0000000000', PublicationYear: 2024 })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									_LifecycleRecordID = tmpResult.IDBook;
									Expect(tmpResult.Title).to.equal('Lifecycle Test');
									Expect(_LifecycleRecordID).to.be.above(0);
									fDone();
								}
							);
					}
				);
				test
				(
					'lifecycle: read the created record',
					function (fDone)
					{
						_SuperTest
							.get(`1.0/Book/${_LifecycleRecordID}`)
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(_LifecycleRecordID);
									Expect(tmpResult.Title).to.equal('Lifecycle Test');
									Expect(tmpResult.Genre).to.equal('Test');
									Expect(tmpResult.ISBN).to.equal('000-0000000000');
									Expect(tmpResult.PublicationYear).to.equal(2024);
									fDone();
								}
							);
					}
				);
				test
				(
					'lifecycle: update the record',
					function (fDone)
					{
						_SuperTest
							.put('1.0/Book')
							.send({ IDBook: _LifecycleRecordID, Title: 'Lifecycle Test (Updated)', PublicationYear: 2025 })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(_LifecycleRecordID);
									Expect(tmpResult.Title).to.equal('Lifecycle Test (Updated)');
									Expect(tmpResult.PublicationYear).to.equal(2025);
									fDone();
								}
							);
					}
				);
				test
				(
					'lifecycle: verify update via read',
					function (fDone)
					{
						_SuperTest
							.get(`1.0/Book/${_LifecycleRecordID}`)
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Title).to.equal('Lifecycle Test (Updated)');
									Expect(tmpResult.PublicationYear).to.equal(2025);
									fDone();
								}
							);
					}
				);
				test
				(
					'lifecycle: count should include the record',
					function (fDone)
					{
						_SuperTest
							.get('1.0/Books/Count/By/Genre/Test')
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Count).to.be.at.least(1);
									fDone();
								}
							);
					}
				);
				test
				(
					'lifecycle: delete the record',
					function (fDone)
					{
						_SuperTest
							.delete(`1.0/Book/${_LifecycleRecordID}`)
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Count).to.equal(1);
									fDone();
								}
							);
					}
				);
				test
				(
					'lifecycle: verify record is gone',
					function (fDone)
					{
						_SuperTest
							.get(`1.0/Book/${_LifecycleRecordID}`)
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Error');
									fDone();
								}
							);
					}
				);
				test
				(
					'lifecycle: undelete the record',
					function (fDone)
					{
						_SuperTest
							.get(`1.0/Book/Undelete/${_LifecycleRecordID}`)
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Count).to.equal(1);
									fDone();
								}
							);
					}
				);
				test
				(
					'lifecycle: verify record is back',
					function (fDone)
					{
						_SuperTest
							.get(`1.0/Book/${_LifecycleRecordID}`)
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(_LifecycleRecordID);
									Expect(tmpResult.Title).to.equal('Lifecycle Test (Updated)');
									fDone();
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// v4.0.17 additions: Create-PreRequest, OriginalRecord retention,
		// Reads-PostOperation on Lite / Select / Distinct list endpoints.
		// ======================================================================
		suite
		(
			'Create-PreRequest fires before Create-Operation',
			() =>
			{
				test
				(
					'setBehavior: Create-PreRequest hook fires before the operation pipeline',
					function (fDone)
					{
						let tmpFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Create-PreRequest',
							(pRequest, pRequestState, fCallback) =>
							{
								tmpFired = true;
								// At this stage the operation hasn't started — Record
								// should be undefined, RecordToCreate shouldn't exist yet
								// either. The HTTP body is the only record source.
								Expect(pRequestState.Record).to.be.undefined;
								Expect(pRequest.body.Title).to.equal('PreRequest Test');
								return fCallback();
							});

						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'PreRequest Test' })
							.end(
								(pError, pResponse) =>
								{
									Expect(tmpFired, 'Create-PreRequest did not fire').to.be.true;
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.Title).to.equal('PreRequest Test');
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Create-PreRequest'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: Create-PreRequest hook can abort the operation',
					function (fDone)
					{
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Create-PreRequest',
							(pRequest, pRequestState, fCallback) =>
							{
								let tmpError = new Error('Rejected by pre-request');
								tmpError.StatusCode = 400;
								return fCallback(tmpError);
							});

						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Should be rejected' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult).to.have.property('Error');
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Create-PreRequest'];
									fDone();
								}
							);
					}
				);
				test
				(
					'setBehavior: CreateBulk-PreRequest fires before per-record operations',
					function (fDone)
					{
						let tmpFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('CreateBulk-PreRequest',
							(pRequest, pRequestState, fCallback) =>
							{
								tmpFired = true;
								Expect(Array.isArray(pRequest.RecordsToBulkCreate)).to.be.true;
								Expect(pRequest.RecordsToBulkCreate).to.have.lengthOf(2);
								return fCallback();
							});

						_SuperTest
							.post('1.0/Books')
							.send([ { Title: 'Bulk A' }, { Title: 'Bulk B' } ])
							.end(
								(pError, pResponse) =>
								{
									Expect(tmpFired, 'CreateBulk-PreRequest did not fire').to.be.true;
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['CreateBulk-PreRequest'];
									fDone();
								}
							);
					}
				);
			}
		);

		suite
		(
			'OriginalRecord retained on pRequestState after Update/Delete/Undelete',
			() =>
			{
				let _OriginalTestID = 0;
				test
				(
					'pre-op: create a seed record for OriginalRecord testing',
					function (fDone)
					{
						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Original Title', Genre: 'Original Genre' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									_OriginalTestID = tmpResult.IDBook;
									Expect(_OriginalTestID).to.be.above(0);
									fDone();
								}
							);
					}
				);
				test
				(
					'Update-PostOperation: pRequestState.OriginalRecord holds the pre-update row',
					function (fDone)
					{
						let tmpSeenOriginal = null;
						let tmpSeenRecord = null;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Update-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								tmpSeenOriginal = pRequestState.OriginalRecord;
								tmpSeenRecord = pRequestState.Record;
								return fCallback();
							});

						_SuperTest
							.put('1.0/Book')
							.send({ IDBook: _OriginalTestID, Title: 'Updated Title', Genre: 'Updated Genre' })
							.end(
								(pError, pResponse) =>
								{
									Expect(tmpSeenOriginal, 'OriginalRecord should be set at post-op').to.not.be.null;
									Expect(tmpSeenOriginal.Title).to.equal('Original Title');
									Expect(tmpSeenRecord.Title).to.equal('Updated Title');
									// The two references must be DIFFERENT objects — the
									// operation overwrites Record with the post-update row
									// while OriginalRecord keeps the pre-update reference.
									Expect(tmpSeenOriginal).to.not.equal(tmpSeenRecord);
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Update-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'Delete-PostOperation: pRequestState.OriginalRecord holds the pre-delete row',
					function (fDone)
					{
						let tmpSeenOriginal = null;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Delete-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								tmpSeenOriginal = pRequestState.OriginalRecord;
								return fCallback();
							});

						_SuperTest
							.delete(`1.0/Book/${_OriginalTestID}`)
							.end(
								(pError, pResponse) =>
								{
									Expect(tmpSeenOriginal, 'OriginalRecord should be set at delete post-op').to.not.be.null;
									Expect(tmpSeenOriginal.IDBook).to.equal(_OriginalTestID);
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Delete-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'Undelete-PostOperation: pRequestState.OriginalRecord holds the pre-undelete row',
					function (fDone)
					{
						let tmpSeenOriginal = null;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Undelete-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								tmpSeenOriginal = pRequestState.OriginalRecord;
								return fCallback();
							});

						_SuperTest
							.get(`1.0/Book/Undelete/${_OriginalTestID}`)
							.end(
								(pError, pResponse) =>
								{
									Expect(tmpSeenOriginal, 'OriginalRecord should be set at undelete post-op').to.not.be.null;
									Expect(tmpSeenOriginal.IDBook).to.equal(_OriginalTestID);
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Undelete-PostOperation'];
									fDone();
								}
							);
					}
				);
			}
		);

		suite
		(
			'Stage-specific PostOperation hooks on Lite / SelectList / Distinct list endpoints',
			() =>
			{
				test
				(
					'ReadsLite-PostOperation fires on /s/Lite and receives loaded records before marshal (ME 2.x hash)',
					function (fDone)
					{
						let tmpFired = false;
						let tmpSeenRecords = null;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('ReadsLite-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								tmpFired = true;
								tmpSeenRecords = pRequestState.Records;
								return fCallback();
							});

						_SuperTest
							.get('1.0/Books/Lite')
							.end(
								(pError, pResponse) =>
								{
									Expect(tmpFired, 'ReadsLite-PostOperation did not fire on lite list').to.be.true;
									Expect(Array.isArray(tmpSeenRecords)).to.be.true;
									// Hook runs BEFORE marshalling — records should still
									// have their full-row shape (Title + Genre + IDBook etc.),
									// not the lite (Hash/Value) shape the client receives.
									if (tmpSeenRecords.length > 0)
									{
										Expect(tmpSeenRecords[0]).to.have.property('IDBook');
									}
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['ReadsLite-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'Reads-PostOperation does NOT fire on /s/Lite (stage isolation)',
					function (fDone)
					{
						let tmpFiredReads = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('Reads-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								tmpFiredReads = true;
								return fCallback();
							});

						_SuperTest
							.get('1.0/Books/Lite')
							.end(
								() =>
								{
									Expect(tmpFiredReads, 'Reads-PostOperation should NOT fire on lite list — consumers register at ReadsLite-PostOperation').to.be.false;
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['Reads-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'ReadSelectList-PostOperation fires on /Select before marshal',
					function (fDone)
					{
						let tmpFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('ReadSelectList-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								tmpFired = true;
								return fCallback();
							});

						_SuperTest
							.get('1.0/BookSelect')
							.end(
								(pError, pResponse) =>
								{
									Expect(tmpFired, 'ReadSelectList-PostOperation did not fire on select list').to.be.true;
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['ReadSelectList-PostOperation'];
									fDone();
								}
							);
					}
				);
				test
				(
					'ReadDistinct-PostOperation fires on /s/Distinct/:Columns before marshal',
					function (fDone)
					{
						let tmpFired = false;
						_MeadowEndpoints.controller.BehaviorInjection.setBehavior('ReadDistinct-PostOperation',
							(pRequest, pRequestState, fCallback) =>
							{
								tmpFired = true;
								return fCallback();
							});

						_SuperTest
							.get('1.0/Books/Distinct/Genre')
							.end(
								(pError, pResponse) =>
								{
									Expect(tmpFired, 'ReadDistinct-PostOperation did not fire on distinct list').to.be.true;
									delete _MeadowEndpoints.controller.BehaviorInjection._BehaviorFunctions['ReadDistinct-PostOperation'];
									fDone();
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// Update by primary key via URL (PUT/PATCH /:IDRecord)
		// ----------------------------------------------------------------------
		// REST-idiomatic in-place update. URL ID is authoritative — clients no
		// longer need to GET → DELETE → INSERT to "edit" a row, which was the
		// pattern that churned auto-ids and broke ID-holding consumers.
		// ======================================================================
		suite
		(
			'Update by primary key via URL',
			() =>
			{
				let _ByIDRecordID = 0;

				suiteSetup
				(
					function (fDone)
					{
						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'PUT-by-id seed', Genre: 'Test' })
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									_ByIDRecordID = tmpResult.IDBook;
									Expect(_ByIDRecordID).to.be.above(0);
									fDone();
								}
							);
					}
				);

				test
				(
					'PUT /:IDRecord updates in place and preserves the primary key',
					function (fDone)
					{
						_SuperTest
							.put(`1.0/Book/${_ByIDRecordID}`)
							.send({ Title: 'PUT-by-id updated', Genre: 'Updated' })
							.end(
								(pError, pResponse) =>
								{
									Expect(pResponse.status).to.equal(200);
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(_ByIDRecordID);
									Expect(tmpResult.Title).to.equal('PUT-by-id updated');
									Expect(tmpResult.Genre).to.equal('Updated');
									fDone();
								}
							);
					}
				);

				test
				(
					'PUT /:IDRecord persists the update and the row is read back at the same ID',
					function (fDone)
					{
						_SuperTest
							.get(`1.0/Book/${_ByIDRecordID}`)
							.end(
								(pError, pResponse) =>
								{
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(_ByIDRecordID);
									Expect(tmpResult.Title).to.equal('PUT-by-id updated');
									fDone();
								}
							);
					}
				);

				test
				(
					'PATCH /:IDRecord behaves the same as PUT — update in place by URL ID',
					function (fDone)
					{
						_SuperTest
							.patch(`1.0/Book/${_ByIDRecordID}`)
							.send({ Title: 'PATCH-by-id', Genre: 'Patched' })
							.end(
								(pError, pResponse) =>
								{
									Expect(pResponse.status).to.equal(200);
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(_ByIDRecordID);
									Expect(tmpResult.Title).to.equal('PATCH-by-id');
									fDone();
								}
							);
					}
				);

				test
				(
					'PUT /:IDRecord — URL ID overrides any IDBook in the body',
					function (fDone)
					{
						// Send a body whose IDBook contradicts the URL. The URL
						// must win so consumers can't accidentally pivot the
						// update to a different row by stale-body cache.
						_SuperTest
							.put(`1.0/Book/${_ByIDRecordID}`)
							.send({ IDBook: 99999, Title: 'URL wins', Genre: 'Override' })
							.end(
								(pError, pResponse) =>
								{
									Expect(pResponse.status).to.equal(200);
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(_ByIDRecordID);
									Expect(tmpResult.Title).to.equal('URL wins');
									fDone();
								}
							);
					}
				);

				test
				(
					'PUT /Upsert is still routed to the upsert endpoint, not /:IDRecord',
					function (fDone)
					{
						// Regression: the literal /Upsert route must not be
						// shadowed by the new /:IDRecord parameterized route.
						_SuperTest
							.put('1.0/Book/Upsert')
							.send({ IDBook: _ByIDRecordID, Title: 'Upsert kept routed' })
							.end(
								(pError, pResponse) =>
								{
									Expect(pResponse.status).to.equal(200);
									let tmpResult = JSON.parse(pResponse.text);
									Expect(tmpResult.IDBook).to.equal(_ByIDRecordID);
									Expect(tmpResult.Title).to.equal('Upsert kept routed');
									fDone();
								}
							);
					}
				);

				test
				(
					'PUT /:IDRecord — full delete → put-with-same-key → re-read round trip',
					function (fDone)
					{
						// Previously this round-trip required GET → DELETE →
						// INSERT, and the new INSERT got a fresh auto-id. With
						// PUT-by-id the primary key is preserved end-to-end.
						_SuperTest
							.post('1.0/Book')
							.send({ Title: 'Round-trip seed' })
							.end(
								(pPostErr, pPostRes) =>
								{
									let tmpRecord = JSON.parse(pPostRes.text);
									let tmpID = tmpRecord.IDBook;
									Expect(tmpID).to.be.above(0);

									_SuperTest
										.put(`1.0/Book/${tmpID}`)
										.send({ Title: 'Round-trip updated' })
										.end(
											(pPutErr, pPutRes) =>
											{
												Expect(pPutRes.status).to.equal(200);

												_SuperTest
													.get(`1.0/Book/${tmpID}`)
													.end(
														(pGetErr, pGetRes) =>
														{
															let tmpReadBack = JSON.parse(pGetRes.text);
															Expect(tmpReadBack.IDBook).to.equal(tmpID);
															Expect(tmpReadBack.Title).to.equal('Round-trip updated');
															fDone();
														}
													);
											}
										);
								}
							);
					}
				);
			}
		);

		// ======================================================================
		// Soft-deleted collision rename on INSERT
		// ----------------------------------------------------------------------
		// New Widget table with a plain UNIQUE INDEX on Code (no
		// `WHERE Deleted=0` predicate) and a plain composite UNIQUE INDEX on
		// (Scope, Hash). Verifies that soft-deleted rows whose values would
		// collide with a new INSERT are renamed deterministically before the
		// INSERT runs, freeing the slot.
		// ======================================================================
		suite
		(
			'Soft-deleted collision rename on INSERT',
			() =>
			{
				let _WidgetMeadow = false;
				let _WidgetEndpoints = false;
				let _DB = false;

				const _WidgetSchema = [
					{ Column: 'IDWidget',       Type: 'AutoIdentity' },
					{ Column: 'GUIDWidget',     Type: 'AutoGUID' },
					{ Column: 'CreateDate',     Type: 'CreateDate' },
					{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
					{ Column: 'UpdateDate',     Type: 'UpdateDate' },
					{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
					{ Column: 'Deleted',        Type: 'Deleted' },
					{ Column: 'DeleteDate',     Type: 'DeleteDate' },
					{ Column: 'DeletingIDUser', Type: 'DeleteIDUser' },
					{ Column: 'Code',           Type: 'String', Unique: true },
					{ Column: 'Scope',          Type: 'String', UniqueGroup: 'ScopeHash' },
					{ Column: 'Hash',           Type: 'String', UniqueGroup: 'ScopeHash' },
					{ Column: 'Name',           Type: 'String' }
				];
				const _WidgetJsonSchema = {
					title: 'Widget',
					type: 'object',
					properties: {
						IDWidget: { type: 'integer' },
						Code: { type: 'string' },
						Scope: { type: 'string' },
						Hash: { type: 'string' },
						Name: { type: 'string' }
					},
					required: ['IDWidget']
				};
				const _WidgetDefault = {
					IDWidget: 0,
					GUIDWidget: '0x0000000000000000',
					CreateDate: null,
					CreatingIDUser: 0,
					UpdateDate: null,
					UpdatingIDUser: 0,
					Deleted: 0,
					DeleteDate: null,
					DeletingIDUser: 0,
					Code: '',
					// Scope/Hash default to null so rows that only exercise the
					// single-column Unique on Code don't collide with each other
					// on the composite UNIQUE — SQLite treats each NULL in a
					// unique index as distinct, so NULL+NULL across many rows
					// is fine. Tests that exercise the composite supply real
					// values explicitly.
					Scope: null,
					Hash: null,
					Name: ''
				};

				const _RenamePrefix = '__mdsd_';

				suiteSetup
				(
					function (fDone)
					{
						_DB = _Fable.MeadowSQLiteProvider.db;

						// Plain UNIQUE INDEX statements — no `WHERE Deleted=0`
						// partial-index syntax. Proof that the rename clears the
						// soft-deleted slot well enough that downstream schemas
						// don't need dialect-specific gymnastics.
						_DB.exec(
							`CREATE TABLE IF NOT EXISTS Widget (
								IDWidget INTEGER PRIMARY KEY AUTOINCREMENT,
								GUIDWidget TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
								CreateDate TEXT,
								CreatingIDUser INTEGER NOT NULL DEFAULT 0,
								UpdateDate TEXT,
								UpdatingIDUser INTEGER NOT NULL DEFAULT 0,
								Deleted INTEGER NOT NULL DEFAULT 0,
								DeleteDate TEXT,
								DeletingIDUser INTEGER NOT NULL DEFAULT 0,
								Code TEXT NOT NULL DEFAULT '',
								Scope TEXT,
								Hash TEXT,
								Name TEXT NOT NULL DEFAULT ''
							);
							CREATE UNIQUE INDEX IF NOT EXISTS widget_code_unique ON Widget(Code);
							CREATE UNIQUE INDEX IF NOT EXISTS widget_scope_hash_unique ON Widget(Scope, Hash);`
						);

						_WidgetMeadow = libMeadow.new(_Fable, 'Widget')
							.setProvider('SQLite')
							.setSchema(_WidgetSchema)
							.setJsonSchema(_WidgetJsonSchema)
							.setDefaultIdentifier('IDWidget')
							.setDefault(_WidgetDefault);

						_WidgetEndpoints = libMeadowEndpoints.new(_WidgetMeadow);
						_WidgetEndpoints.connectRoutes(_Orator.serviceServer);

						return fDone();
					}
				);

				test
				(
					'INSERT with a value colliding with a soft-deleted row succeeds and renames the soft-deleted row',
					function (fDone)
					{
						// Setup: create a widget with Code=alpha and soft-delete it.
						_SuperTest
							.post('1.0/Widget')
							.send({ Code: 'alpha', Name: 'Original' })
							.end(
								(pPostErr, pPostRes) =>
								{
									Expect(pPostRes.status).to.equal(200);
									let tmpOriginal = JSON.parse(pPostRes.text);
									Expect(tmpOriginal.Code).to.equal('alpha');
									let tmpOriginalID = tmpOriginal.IDWidget;

									_SuperTest
										.delete(`1.0/Widget/${tmpOriginalID}`)
										.end(
											(pDelErr, pDelRes) =>
											{
												Expect(pDelRes.status).to.equal(200);
												// Soft-deleted: row 1 still exists with Code=alpha and Deleted=1.

												// Now insert a NEW widget with Code=alpha. The plain
												// UNIQUE INDEX would reject this without the rename;
												// with the rename, the soft-deleted row's Code gets
												// renamed deterministically and the new INSERT wins
												// the slot.
												_SuperTest
													.post('1.0/Widget')
													.send({ Code: 'alpha', Name: 'Replacement' })
													.end(
														(pNewErr, pNewRes) =>
														{
															Expect(pNewRes.status, `unexpected status ${pNewRes.status}; body=${pNewRes.text}`).to.equal(200);
															let tmpNew = JSON.parse(pNewRes.text);
															Expect(tmpNew.Code).to.equal('alpha');
															Expect(tmpNew.Name).to.equal('Replacement');
															Expect(tmpNew.IDWidget).to.be.above(tmpOriginalID);

															// Verify the soft-deleted row was renamed
															// deterministically. Inspect via the raw DB
															// (bypassing the soft-delete filter the API
															// applies by default).
															let tmpRow = _DB.prepare('SELECT IDWidget, Code, Deleted FROM Widget WHERE IDWidget = ?').get(tmpOriginalID);
															Expect(tmpRow).to.exist;
															Expect(tmpRow.Deleted).to.equal(1);
															Expect(tmpRow.Code).to.match(new RegExp('^' + _RenamePrefix + '[0-9a-f]{16}$'));

															// Determinism: recompute the expected suffix
															// from (IDRecord, Column, OriginalValue) and
															// check it matches.
															const libCrypto = require('crypto');
															const tmpExpected = _RenamePrefix + libCrypto.createHash('sha1').update(`${tmpOriginalID}:Code:alpha`).digest('hex').slice(0, 16);
															Expect(tmpRow.Code).to.equal(tmpExpected);

															fDone();
														}
													);
											}
										);
								}
							);
					}
				);

				test
				(
					'Composite (Scope, Hash) collision: soft-deleted row gets BOTH columns renamed',
					function (fDone)
					{
						_SuperTest
							.post('1.0/Widget')
							.send({ Code: 'cmp1', Scope: 'TenantA', Hash: 'hashV1', Name: 'Composite original' })
							.end(
								(pPostErr, pPostRes) =>
								{
									Expect(pPostRes.status).to.equal(200);
									let tmpOriginal = JSON.parse(pPostRes.text);
									let tmpOriginalID = tmpOriginal.IDWidget;

									_SuperTest
										.delete(`1.0/Widget/${tmpOriginalID}`)
										.end(
											(pDelErr, pDelRes) =>
											{
												Expect(pDelRes.status).to.equal(200);

												_SuperTest
													.post('1.0/Widget')
													.send({ Code: 'cmp2', Scope: 'TenantA', Hash: 'hashV1', Name: 'Composite replacement' })
													.end(
														(pNewErr, pNewRes) =>
														{
															Expect(pNewRes.status, `unexpected status ${pNewRes.status}; body=${pNewRes.text}`).to.equal(200);
															let tmpNew = JSON.parse(pNewRes.text);
															Expect(tmpNew.Scope).to.equal('TenantA');
															Expect(tmpNew.Hash).to.equal('hashV1');

															// Both Scope and Hash on the soft-deleted row
															// should now be __mdsd_-prefixed.
															let tmpRow = _DB.prepare('SELECT IDWidget, Scope, Hash, Deleted FROM Widget WHERE IDWidget = ?').get(tmpOriginalID);
															Expect(tmpRow.Deleted).to.equal(1);
															Expect(tmpRow.Scope).to.match(new RegExp('^' + _RenamePrefix + '[0-9a-f]{16}$'));
															Expect(tmpRow.Hash).to.match(new RegExp('^' + _RenamePrefix + '[0-9a-f]{16}$'));

															const libCrypto = require('crypto');
															const tmpExpectedScope = _RenamePrefix + libCrypto.createHash('sha1').update(`${tmpOriginalID}:Scope:TenantA`).digest('hex').slice(0, 16);
															const tmpExpectedHash = _RenamePrefix + libCrypto.createHash('sha1').update(`${tmpOriginalID}:Hash:hashV1`).digest('hex').slice(0, 16);
															Expect(tmpRow.Scope).to.equal(tmpExpectedScope);
															Expect(tmpRow.Hash).to.equal(tmpExpectedHash);

															fDone();
														}
													);
											}
										);
								}
							);
					}
				);

				test
				(
					'Live (non-deleted) row colliding on a unique index still errors — rename only fires for soft-deleted',
					function (fDone)
					{
						_SuperTest
							.post('1.0/Widget')
							.send({ Code: 'beta', Name: 'Live row' })
							.end(
								(pPostErr, pPostRes) =>
								{
									Expect(pPostRes.status).to.equal(200);

									// No DELETE this time. Insert again with Code=beta —
									// should error because the live row holds the slot.
									_SuperTest
										.post('1.0/Widget')
										.send({ Code: 'beta', Name: 'Live collision' })
										.end(
											(pNewErr, pNewRes) =>
											{
												let tmpResult = JSON.parse(pNewRes.text);
												Expect(tmpResult).to.have.property('Error');
												fDone();
											}
										);
								}
							);
					}
				);

				test
				(
					'Round-trip: delete → POST-with-same-Code → re-read cleanly, no partial-index needed',
					function (fDone)
					{
						// End-to-end demonstration of the scenario downstream
						// schemas used to need `WHERE Deleted=0` to support.
						_SuperTest
							.post('1.0/Widget')
							.send({ Code: 'roundtrip', Name: 'gen-1' })
							.end(
								(pPostErr, pPostRes) =>
								{
									let tmpFirst = JSON.parse(pPostRes.text);
									Expect(tmpFirst.IDWidget).to.be.above(0);

									_SuperTest
										.delete(`1.0/Widget/${tmpFirst.IDWidget}`)
										.end(
											(pDelErr) =>
											{
												_SuperTest
													.post('1.0/Widget')
													.send({ Code: 'roundtrip', Name: 'gen-2' })
													.end(
														(pPost2Err, pPost2Res) =>
														{
															Expect(pPost2Res.status).to.equal(200);
															let tmpSecond = JSON.parse(pPost2Res.text);
															Expect(tmpSecond.IDWidget).to.not.equal(tmpFirst.IDWidget);

															_SuperTest
																.get(`1.0/Widget/${tmpSecond.IDWidget}`)
																.end(
																	(pGetErr, pGetRes) =>
																	{
																		Expect(pGetRes.status).to.equal(200);
																		let tmpReadBack = JSON.parse(pGetRes.text);
																		Expect(tmpReadBack.Code).to.equal('roundtrip');
																		Expect(tmpReadBack.Name).to.equal('gen-2');
																		fDone();
																	}
																);
														}
													);
											}
										);
								}
							);
					}
				);

				test
				(
					'Upsert (create branch) also benefits from the rename',
					function (fDone)
					{
						// Upsert with a new GUID + a Code that collides with a
						// soft-deleted row. The rename must run on the create
						// branch of the upsert too.
						_SuperTest
							.post('1.0/Widget')
							.send({ Code: 'upsertcollide', Name: 'upsert-original' })
							.end(
								(pPostErr, pPostRes) =>
								{
									let tmpOriginalID = JSON.parse(pPostRes.text).IDWidget;
									_SuperTest
										.delete(`1.0/Widget/${tmpOriginalID}`)
										.end(
											() =>
											{
												// IDWidget=0 forces the upsert path to a Create.
												_SuperTest
													.put('1.0/Widget/Upsert')
													.send({ IDWidget: 0, Code: 'upsertcollide', Name: 'upsert-new' })
													.end(
														(pUpErr, pUpRes) =>
														{
															Expect(pUpRes.status, `unexpected status ${pUpRes.status}; body=${pUpRes.text}`).to.equal(200);
															let tmpResult = JSON.parse(pUpRes.text);
															Expect(tmpResult.Code).to.equal('upsertcollide');
															Expect(tmpResult.Name).to.equal('upsert-new');
															Expect(tmpResult.IDWidget).to.not.equal(tmpOriginalID);
															fDone();
														}
													);
											}
										);
								}
							);
					}
				);
			}
		);
	}
);
