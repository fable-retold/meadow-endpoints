/**
* Unit tests for the MeadowEndpoints Server
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

var Chai = require("chai");
var Expect = Chai.expect;
var Assert = Chai.assert;

var libSuperTest = require('supertest');

var libMySQL = require('mysql2');
var libAsync = require('async');

var tmpFableSettings = 	(
{
	Product: 'MockOratorAlternate',
	ProductVersion: '0.0.0',

	"UnauthorizedRequestDelay": 10,

	APIServerPort: 9080,

	MySQL:
		{
			// This is queued up for Travis defaults.
			Server: "localhost",
			Port: 3306,
			User: process.env.DEV_MYSQL_USER || "root",
			Password: process.env.DEV_MYSQL_PASS || "",
			Database: "FableTest",
			ConnectionPoolLimit: 20
		},
	ConfigFile: __dirname + "/../MeadowTest-Settings.json"
});

var libFable = require('fable').new(tmpFableSettings);
tmpFableSettings = libFable.settings;

var libMySQL = require('mysql2');
libFable.MeadowMySQLConnectionPool = libMySQL.createPool
	(
		{
			connectionLimit: libFable.settings.MySQL.ConnectionPoolLimit,
			host: libFable.settings.MySQL.Server,
			port: libFable.settings.MySQL.Port,
			user: libFable.settings.MySQL.User,
			password: libFable.settings.MySQL.Password,
			database: libFable.settings.MySQL.Database,
			namedPlaceholders: true
		}
	);

var _MockSessionValidUser = (
	{
		SessionID: '0000-VALID',
		UserID: 37,
		UserRole: 'User',
		UserRoleIndex: 1,
		LoggedIn: true,
		DeviceID: 'TEST-HARNESS',
		CustomerID: 1
	});
var ValidAuthentication = function(pRequest, pResponse, fNext)
{
	pRequest.UserSession = _MockSessionValidUser;
	fNext();
}

var _Meadow;
var _MeadowEndpoints;

var _AnimalSchema = require('./Animal.json');

// Now that we have some test data, wire up the endpoints!

// Load up a Meadow (pointing at the Animal database)
_Meadow = require('meadow')
				.new(libFable, 'FableTest')
				.setProvider('MySQL')
				.setSchema(_AnimalSchema.Schema)
				.setJsonSchema(_AnimalSchema.JsonSchema)
				.setDefaultIdentifier(_AnimalSchema.DefaultIdentifier)
				.setDefault(_AnimalSchema.DefaultObject)
				.setAuthorizer(_AnimalSchema.Authorization);
// Instantiate the endpoints
_MeadowEndpoints = require('../source/Meadow-Endpoints.js').new(_Meadow);

suite
(
	'Meadow-Endpoints',
	function()
	{
		// TODO: Abstract this so it can be run again and again.
		var _SpooledUp = false;
		var _Orator;

		var getAnimalInsert = function(pName, pType)
		{
			return "INSERT INTO `FableTest` (`IDAnimal`, `GUIDAnimal`, `CreateDate`, `CreatingIDUser`, `UpdateDate`, `UpdatingIDUser`, `Deleted`, `DeleteDate`, `DeletingIDUser`, `Name`, `Type`, `IDCustomer`) VALUES (NULL, '00000000-0000-0000-0000-000000000000', NOW(), 1, NOW(), 1, 0, NULL, 0, '"+pName+"', '"+pType+"', 1); ";
		};

		setup
		(
			function(fDone)
			{
				// Only do this for the first test, so we persiste database state across suites
				if (!_SpooledUp)
				{
					_Orator = require('orator').new(tmpFableSettings);
					_Orator.enabledModules.CORS = true;
					_Orator.enabledModules.FullResponse = true;
					_Orator.enabledModules.Body = false;


					var _SQLConnectionPool = libMySQL.createPool
					(
						{
							connectionLimit: tmpFableSettings.MySQL.ConnectionPoolLimit,
							host: tmpFableSettings.MySQL.Server,
							port: tmpFableSettings.MySQL.Port,
							user: tmpFableSettings.MySQL.User,
							password: tmpFableSettings.MySQL.Password,
							database: tmpFableSettings.MySQL.Database
						}
					);

					// Tear down previous test data, rebuild records
					libAsync.waterfall(
					[
						function(fCallBack)
						{
							_SQLConnectionPool.query('DROP TABLE IF EXISTS FableTest',
							function(pErrorUpdate, pResponse) { fCallBack(null); });
						},
						function(fCallBack)
						{
							_SQLConnectionPool.query("CREATE TABLE IF NOT EXISTS FableTest (IDAnimal INT UNSIGNED NOT NULL AUTO_INCREMENT, GUIDAnimal CHAR(36) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000', CreateDate DATETIME, CreatingIDUser INT NOT NULL DEFAULT '0', UpdateDate DATETIME, UpdatingIDUser INT NOT NULL DEFAULT '0', Deleted TINYINT NOT NULL DEFAULT '0', DeleteDate DATETIME, DeletingIDUser INT NOT NULL DEFAULT '0', Name CHAR(128) NOT NULL DEFAULT '', Type CHAR(128) NOT NULL DEFAULT '', IDCustomer INT NOT NULL DEFAULT '0', PRIMARY KEY (IDAnimal) );",
							function(pErrorUpdate, pResponse) { fCallBack(null); });
						},
						function(fCallBack)
						{
							_SQLConnectionPool.query(getAnimalInsert('Foo Foo', 'Bunny'),
							function(pErrorUpdate, pResponse) { fCallBack(null); });
						},
						function(fCallBack)
						{
							_SQLConnectionPool.query(getAnimalInsert('Red Riding Hood', 'Girl'),
							function(pErrorUpdate, pResponse) { fCallBack(null); });
						},
						function(fCallBack)
						{
							_SQLConnectionPool.query(getAnimalInsert('Red', 'Dog'),
							function(pErrorUpdate, pResponse) { fCallBack(null); });
						},
						function(fCallBack)
						{
							_SQLConnectionPool.query(getAnimalInsert('Spot', 'Dog'),
							function(pErrorUpdate, pResponse) { fCallBack(null); });
						},
						function(fCallBack)
						{
							_SQLConnectionPool.query(getAnimalInsert('Gertrude', 'Frog'),
							function(pErrorUpdate, pResponse) { fCallBack(null); });
						},
						function(fCallBack)
						{
							// Start the web server
							// Wire up an "always logged in" user in the request chain, so session is set right.
							_Orator.webServer.use(ValidAuthentication);
							_MeadowEndpoints.setEndpointAuthorization
							(
								'Create',
								2
							);
							_MeadowEndpoints.setEndpointAuthenticator ('Reads');
							_MeadowEndpoints.setEndpointAuthenticator
							(
								'Reads',
								function(pRequest, pResponse, fNext)
								{
									pRequest.EndpointAuthenticated = true;
									fNext();
								}
							);
							_MeadowEndpoints.setEndpoint('Randomize');
							_MeadowEndpoints.setEndpoint('Randomize', function() {});

							_MeadowEndpoints.behaviorModifications.setTemplate('ListQuery', '<%= MyData %>');
							//_MeadowEndpoints.behaviorModifications.setTemplate('SelectList', '<%= Name %>|<%= Type %>');

							// Wire the endpoints up
							_MeadowEndpoints.connectRoutes(_Orator.webServer);
							_Orator.startWebServer (function() { fCallBack(null); });
						}
					],
						function(pError, pResult)
						{
							// Now continue the tests.
							_SpooledUp = true;
							fDone();
						}
					);
				}
				else
				{
					fDone();
				}
			}
		);

		setup
		(
			function()
			{
			}
		);

		suite
		(
			'Object Sanity',
			function()
			{
				test
				(
					'initialize should build a happy little object',
					function()
					{
						Expect(_MeadowEndpoints).to.be.an('object', 'MeadowEndpoints should initialize as an object directly from the require statement.');
					}
				);
			}
		);
		suite
		(
			'Behavior Modifications',
			function()
			{
				test
				(
					'instantiate a behavior modification object',
					function()
					{
						var tmpBehaviorMods = require('../source/Meadow-BehaviorModifications.js').new(libFable);
						Expect(tmpBehaviorMods).to.be.an('object');
					}
				);
				test
				(
					'exercise the templates api',
					function()
					{
						var tmpBehaviorMods = require('../source/Meadow-BehaviorModifications.js').new(libFable);

						var tmpCrossBehaviorState = 0;

						Expect(tmpBehaviorMods.runBehavior('NoBehaviorsHere', {}, function() {})).to.equal(undefined, 'nonexistant behaviors should just execute');
						tmpBehaviorMods.setBehavior('BigBehavior', function() { tmpCrossBehaviorState++ });
						Expect(tmpCrossBehaviorState).to.equal(0);
						Expect(tmpBehaviorMods.runBehavior('BigBehavior', {}, function() {})).to.equal(undefined, 'existant behaviors should just execute');
						Expect(tmpCrossBehaviorState).to.equal(1);
					}
				);
				test
				(
					'exercise the behavior modification api',
					function()
					{
						var tmpBehaviorMods = require('../source/Meadow-BehaviorModifications.js').new(libFable);
						Expect(tmpBehaviorMods.getTemplateFunction('NoTemplatesHere')).to.equal(false, 'empty template hashes on empty sets should return false');
						Expect(tmpBehaviorMods.getTemplate('NoTemplatesHere')).to.equal(false,'emtpy template sets should be false');
						tmpBehaviorMods.setTemplate('AnimalFormatter', '<p>An animal (id <%= Number %> is here</p>');
						Expect(tmpBehaviorMods.getTemplate('AnimalFormatter')).to.contain('An animal');
						Expect(tmpBehaviorMods.processTemplate('AnimalFormatter', {Number:5})).to.contain('id 5');
						Expect(tmpBehaviorMods.processTemplate('FriendFormatter', {Number:5}, 'blit <%= Number %>')).to.contain('blit 5');
						Expect(tmpBehaviorMods.processTemplate('Blank', {Number:5})).to.equal('');
						tmpBehaviorMods.setTemplate('SimpleTemplate', 'Not so simple.');
						Expect(tmpBehaviorMods.processTemplate('SimpleTemplate')).to.equal('Not so simple.');
					}
				);
				test
				(
					'exercise the security modification api',
					function()
					{
						var tmpAuthorizers = require('../source/Meadow-Authorizers.js').new(libFable);
						tmpAuthorizers.setAuthorizer('AlwaysAuthorize',
							function(pRequest, fComplete)
							{
								pRequest.MeadowAuthorization = true;
							});
						var tmpMockRequest = {MeadowAuthorization: 'Green'};
						tmpAuthorizers.authorize('BadHash', tmpMockRequest,
							function()
							{
								Expect(tmpMockRequest.MeadowAuthorization).to.equal('Green');
							});
						tmpAuthorizers.authorize('AlwaysAuthorize', tmpMockRequest,
							function()
							{
								Expect(tmpMockRequest.MeadowAuthorization).to.equal(true);
							});
						tmpAuthorizers.authorize('Allow', tmpMockRequest,
							function()
							{
								Expect(tmpMockRequest.MeadowAuthorization).to.equal(true);
							});
						tmpAuthorizers.authorize('Deny', tmpMockRequest,
							function()
							{
								Expect(tmpMockRequest.MeadowAuthorization).to.equal(false);
							});
						var tmpMockFullRequest =
						{
							UserSession:
							{
								CustomerID: 10,
								UserID: 1
							},
							Record:
							{
								IDCustomer: 10,
								IDUser: 1
							}
						};
						// Test that
					}
				);
				test
				(
					'exercise the security modification authenticators',
					function()
					{
						var tmpAuthorizers = require('../source/Meadow-Authorizers.js').new(libFable);
						var tmpMockFullRequest =
						{
							UserSession:
							{
								CustomerID: 10,
								UserID: 1
							},
							Record:
							{
								IDCustomer: 10,
								CreatingIDUser: 1
							}
						};
						// Mine and MyCustomer should both work
						tmpAuthorizers.authorize('Mine', tmpMockFullRequest,
							function()
							{
								Expect(tmpMockFullRequest.MeadowAuthorization).to.equal(true);
							});
						tmpAuthorizers.authorize('MyCustomer', tmpMockFullRequest,
							function()
							{
								Expect(tmpMockFullRequest.MeadowAuthorization).to.equal(true);
							});
						tmpMockFullRequest.UserSession.CustomerID = 100;
						tmpMockFullRequest.UserSession.UserID = 100;
						// Now they should both fail
						tmpAuthorizers.authorize('Mine', tmpMockFullRequest,
							function()
							{
								//If record does not have matching CreatingIDUser, then it should fail
								Expect(tmpMockFullRequest.MeadowAuthorization).to.equal(false);
							});
						tmpAuthorizers.authorize('MyCustomer', tmpMockFullRequest,
							function()
							{
								//If record does not have matching CustomerID, then it should fail
								Expect(tmpMockFullRequest.MeadowAuthorization).to.equal(false);
							});
					}
				);
			}
		);
		suite
		(
			'Basic Server Routes',
			function()
			{
				test
				(
					'create: create a record',
					function(fDone)
					{
						var tmpRecord = {Name:'BatBrains', Type:'Mammoth'};
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Type).to.equal('Mammoth');
								Expect(tmpResult.CreatingIDUser).to.equal(37);
								fDone();
							}
						);
					}
				);
				test
				(
					'create: create a record',
					function(fDone)
					{
						var tmpRecord = {Name:'BatBrains', Type:'Mammoth'};
						_MockSessionValidUser.UserRoleIndex = 1;
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('authenticated');
								fDone();
							}
						);
					}
				);
				test
				(
					'create: create a record with a bad record passed in',
					function(fDone)
					{
						var tmpRecord = ' ';
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.not.be.null;
								fDone();
							}
						);
					}
				);
				test
				(
					'read: get a specific record',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/2')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Type).to.equal('Girl');
								fDone();
							}
						);
					}
				);
				test
				(
					'read: define a custom authorization behavior',
					function(fDone)
					{
						const defaultAuthorizer = _MeadowEndpoints.endpointAuthorizers.getAuthorizer('Allow');
						_MeadowEndpoints.endpointAuthorizers.setAuthorizer('Allow', function(req, next) { req.MeadowAuthorization = false; return next(); });
						_Orator.webServer.get('/CustomHotRodRoute/:IDRecord', _MeadowEndpoints.endpointAuthenticators.Read, _MeadowEndpoints.wireState, _MeadowEndpoints.endpoints.Read);
						libSuperTest('http://localhost:9080/')
						.get('CustomHotRodRoute/2')
						.end(
							function (pError, pResponse)
							{
								_MeadowEndpoints.endpointAuthorizers.setAuthorizer('Allow', defaultAuthorizer);
								//TODO: it's weird that we don't get an error here for access denied...
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');
								fDone();
							}
						);
					}
				);
				test
				(
					'read: define a custom route and get a record with it',
					function(fDone)
					{
						_Orator.webServer.get('/CustomHotRodRoute/:IDRecord', _MeadowEndpoints.endpointAuthenticators.Read, _MeadowEndpoints.wireState, _MeadowEndpoints.endpoints.Read);
						libSuperTest('http://localhost:9080/')
						.get('CustomHotRodRoute/2')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Type).to.equal('Girl');
								fDone();
							}
						);
					}
				);
				test
				(
					'read: get a specific record but be denied by security',
					function(fDone)
					{
						_Meadow.schemaFull.authorizer.Manager = {};
						_Meadow.schemaFull.authorizer.Manager.Read = 'Deny';

						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/2')
						.end(
							function (pError, pResponse)
							{
								Expect(pResponse.text).to.contain('UNAUTHORIZED ACCESS IS NOT ALLOWED');
								// Reset authorization
								_Meadow.schemaFull.authorizer.Manager.Read = 'Allow';
								fDone();
							}
						);
					}
				);
				test
				(
					'read: get a specific record which resolved to Deny authorization, but with a Deny authorizer that just allows',
					function(fDone)
					{
						_Meadow.schemaFull.authorizer.Manager = {};
						_Meadow.schemaFull.authorizer.Manager.Read = 'Deny';
						const defaultAuthorizer = _MeadowEndpoints.endpointAuthorizers.getAuthorizer('Deny');
						_MeadowEndpoints.endpointAuthorizers.setAuthorizer('Deny', function(req, next) { req.MeadowAuthorization = true; return next(); });

						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/2')
						.end(
							function (pError, pResponse)
							{
								// Reset authorization
								_Meadow.schemaFull.authorizer.Manager.Read = 'Allow';
								_MeadowEndpoints.endpointAuthorizers.setAuthorizer('Deny', defaultAuthorizer);

								const responseBody = JSON.parse(pResponse.text);
								Expect(responseBody.IDAnimal).to.equal(2);
								fDone();
							}
						);
					}
				);
				test
				(
					'read: get a specific record with a bad parameter',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.equal('Error retreiving a record. Record not found');
								fDone();
							}
						);
					}
				);
				test
				(
					'reads: get all records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(6);
								Expect(tmpResults[0].Type).to.equal('Bunny');
								Expect(tmpResults[4].Name).to.equal('Gertrude');
								fDone();
							}
						);
					}
				);
				test
				(
					'query: reads all records via JSON body (default mode)',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTests/Query')
						.send({})
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults).to.be.an('array');
								Expect(tmpResults.length).to.equal(6);
								fDone();
							}
						);
					}
				);
				test
				(
					'query: reads with filter in the body',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTests/Query')
						.send({ Filter: 'FBV~Type~EQ~Dog' })
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults).to.be.an('array');
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[0].Type).to.equal('Dog');
								fDone();
							}
						);
					}
				);
				test
				(
					'query: Lite read via boolean flag with pagination',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTests/Query')
						.send({ Lite: true, Begin: 0, Cap: 3 })
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults).to.be.an('array');
								Expect(tmpResults.length).to.equal(3);
								fDone();
							}
						);
					}
				);
				test
				(
					'query: Distinct read via boolean flag and Columns',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTests/Query')
						.send({ Distinct: true, Columns: 'Type' })
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults).to.be.an('array');
								Expect(tmpResults.length).to.be.at.least(1);
								fDone();
							}
						);
					}
				);
				test
				(
					'query: Count flag takes precedence and honors the filter',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTests/Query')
						.send({ Lite: true, Count: true, Filter: 'FBV~Type~EQ~Dog' })
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults).to.have.property('Count');
								Expect(tmpResults.Count).to.equal(2);
								fDone();
							}
						);
					}
				);
				test
				(
					'query: URL-decodes a filter in the body the way the GET route would',
					function(fDone)
					{
						// 'Foo Foo' carries a space; a LIKE match for it is written
						// `%Foo Foo%`. As a filter it is URL-encoded for the GET route's
						// :Filter path segment (% -> %25, space -> %20), which the HTTP
						// layer decodes. The body-driven Query route must decode it too,
						// or the literal `%25Foo%20Foo%25` is sent to SQL and matches
						// nothing.
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTests/Query')
						.send({ Filter: 'FBV~Name~LK~%25Foo%20Foo%25' })
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults).to.be.an('array');
								Expect(tmpResults.length).to.equal(1);
								Expect(tmpResults[0].Name).to.equal('Foo Foo');
								fDone();
							}
						);
					}
				);
				test
				(
					'readsLiteExtended: get all records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/LiteExtended/Type,Name')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(6);
								Expect(tmpResults[0].IDAnimal).to.equal(1);
								Expect(tmpResults[4].IDAnimal).to.equal(5);
								Expect(tmpResults[4].Type).to.equal('Frog');
								fDone();
							}
						);
					}
				);
				test
				(
					'readsLite: ReadsLite-PostOperation behavior fires and can modify records',
					function(fDone)
					{
						_MeadowEndpoints.behaviorModifications.setBehavior('ReadsLite-PostOperation',
							function(pRequest, fComplete)
							{
								// Simulate field cleansing by removing Type from all records
								pRequest.Records.forEach(function(pRecord)
								{
									delete pRecord.Type;
								});
								fComplete(false);
							});
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/LiteExtended/Type,Name')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(6);
								// Type was requested via LiteExtended but removed by PostOperation behavior
								Expect(tmpResults[0]).to.not.have.property('Type');
								Expect(tmpResults[4]).to.not.have.property('Type');
								// Name was not removed and should still be present
								Expect(tmpResults[4].Name).to.equal('Gertrude');
								// Clean up
								_MeadowEndpoints.behaviorModifications.setBehavior('ReadsLite-PostOperation', null);
								fDone();
							}
						);
					}
				);
				test
				(
					'readsLite: ReadsLite-PostOperation behavior fires for standard Lite endpoint',
					function(fDone)
					{
						var tmpBehaviorFired = false;
						_MeadowEndpoints.behaviorModifications.setBehavior('ReadsLite-PostOperation',
							function(pRequest, fComplete)
							{
								tmpBehaviorFired = true;
								fComplete(false);
							});
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/Lite')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(6);
								Expect(tmpBehaviorFired).to.equal(true);
								// Clean up
								_MeadowEndpoints.behaviorModifications.setBehavior('ReadsLite-PostOperation', null);
								fDone();
							}
						);
					}
				);
				test
				(
					'readsLite: ReadsLite-PostOperation error halts response',
					function(fDone)
					{
						_MeadowEndpoints.behaviorModifications.setBehavior('ReadsLite-PostOperation',
							function(pRequest, fComplete)
							{
								fComplete({Code:403,Message:'SENSITIVE FIELD ACCESS DENIED'});
							});
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/LiteExtended/Type,Name')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult).to.have.property('Error');
								// Clean up
								_MeadowEndpoints.behaviorModifications.setBehavior('ReadsLite-PostOperation', null);
								fDone();
							}
						);
					}
				);
				test
				(
					'readsby: get all records by Type',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/By/Type/Dog')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[0].Type).to.equal('Dog');
								fDone();
							}
						);
					}
				);
				test
				(
					'readsby: get all records by Type IN LIST',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/By/Type/Mammoth%2C%20WithComma,Dog')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[0].Type).to.equal('Dog');
								fDone();
							}
						);
					}
				);
				test
				(
					'countby: get count of records by Type',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/Count/By/Type/Dog')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.Count).to.equal(2);
								fDone();
							}
						);
					}
				);
				test
				(
					'countby: get count of records by multiple Types',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/Count/By/Type/Dog,Mammoth')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.Count).to.equal(3);
								fDone();
							}
						);
					}
				);
				test
				(
					'readsby: get paged records by Type',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/By/Type/Dog/1/1')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(1);
								Expect(tmpResults[0].Name).to.equal('Spot');
								fDone();
							}
						);
					}
				);
				test
				(
					'readselect: get a page of filtered records by date',
					function(fDone)
					{
						var today = new Date();
						today = today.toISOString().substring(0, 10);

						libSuperTest('http://localhost:9080/')
						.get(`1.0/FableTestSelect/FilteredTo/FBD~UpdateDate~EQ~${today}/0/1`)
						.end(
							function (pError, pResponse)
							{
								console.log(pResponse.text)
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(1);
								Expect(tmpResults[0].Value).to.equal('FableTest #1');
								fDone();
							}
						);
					}
				);
				test
				(
					'readselect: get all records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTestSelect')
						.end(
							function (pError, pResponse)
							{
								console.log(pResponse.text)
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(6);
								Expect(tmpResults[4].Value).to.equal('FableTest #5');
								fDone();
							}
						);
					}
				);
				test
				(
					'readselect: get a page of records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTestSelect/2/2')
						.end(
							function (pError, pResponse)
							{
								console.log(pResponse.text)
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[1].Value).to.equal('FableTest #4');
								fDone();
							}
						);
					}
				);
				test
				(
					'readselect: get a page of records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTestSelect/2/2')
						.end(
							function (pError, pResponse)
							{
								console.log(pResponse.text)
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[1].Value).to.equal('FableTest #4');
								fDone();
							}
						);
					}
				);
				test
				(
					'readselect: get filtered records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTestSelect/FilteredTo/FBV~Type~EQ~Dog')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[0].Value).to.equal('FableTest #3');
								fDone();
							}
						);
					}
				);
				test
				(
					'readselect: get a page of filtered records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTestSelect/FilteredTo/FBV~Type~EQ~Dog/1/1')
						.end(
							function (pError, pResponse)
							{
								console.log(pResponse.text)
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(1);
								Expect(tmpResults[0].Value).to.equal('FableTest #4');
								fDone();
							}
						);
					}
				);
				test
				(
					'readselect: get an empty page of records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTestSelect/200/200')
						.end(
							function (pError, pResponse)
							{
								console.log(pResponse.text)
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(0);
								fDone();
							}
						);
					}
				);
				test
				(
					'reads: get a page of records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						// Get page 2, 2 records per page.
						.get('1.0/FableTests/2/2')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[0].Type).to.equal('Dog');
								Expect(tmpResults[1].Name).to.equal('Spot');
								fDone();
							}
						);
					}
				);
				test
				(
					'reads: get a filtered set of records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/FilteredTo/FBV~Type~EQ~Frog')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(1);
								Expect(tmpResults[0].Type).to.equal('Frog');
								fDone();
							}
						);
					}
				);
				test
				(
					'reads: get distinct values for a column',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/Distinct/Type')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(5);
								const types = tmpResults.map((r) => r.Type);
								Expect(types).to.have.members(['Bunny', 'Girl', 'Dog', 'Frog', 'Mammoth']);
								fDone();
							}
						);
					}
				);
				test
				(
					'reads: get distinct values for a column with filter',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/Distinct/Type/FilteredTo/FBV~IDAnimal~LT~3')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								const types = new Set(tmpResults.map((r) => r.Type));
								Expect(types.size).to.equal(2);
								fDone();
							}
						);
					}
				);
				test
				(
					'reads: get distinct values for a column with filter and pagination',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/Distinct/Type/FilteredTo/FBV~IDAnimal~LT~3/0/1')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(1);
								fDone();
							}
						);
					}
				);
				test
				(
					'reads: get distinct values for a column with pagination',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/Distinct/Type/2/2')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								const types = new Set(tmpResults.map((r) => r.Type));
								Expect(types.size).to.equal(2);
								fDone();
							}
						);
					}
				);
				test
				(
					'reads: get a filtered paged set of records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						// Skip one record, 2 records per page.
						.get('1.0/FableTests/FilteredTo/FBV~Type~EQ~Dog/1/2')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(1);
								Expect(tmpResults[0].Type).to.equal('Dog');
								fDone();
							}
						);
					}
				);
				test
				(
					'update: update a record with a missing ID',
					function(fDone)
					{
						// Update animal but don't provide ID
						var tmpRecord = { Type:'Corgi' };
						libSuperTest('http://localhost:9080/')
						.del('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the count of deleted records.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('a valid record ID is required');
								fDone();
							}
						);
					}
				);
				test
				(
					'update: update a record with a malformed ID',
					function(fDone)
					{
						// Update animal but don't provide ID
						var tmpRecord = { IDAnimal: { ID: 3 }, Type:'Corgi' };
						libSuperTest('http://localhost:9080/')
						.del('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the count of deleted records.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('a valid record ID is required');
								fDone();
							}
						);
					}
				);
				test
				(
					'update: update a record',
					function(fDone)
					{
						// Change animal 4 ("Spot") to a Corgi
						var tmpRecord = {IDAnimal:4, Type:'Corgi'};
						libSuperTest('http://localhost:9080/')
						.put('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Type).to.equal('Corgi');
								Expect(tmpResult.CreatingIDUser).to.equal(1);
								Expect(tmpResult.UpdatingIDUser).to.equal(37);
								fDone();
							}
						);
					}
				);
				test
				(
					'delete: delete a record',
					function(fDone)
					{
						// Delete animal 3 ("Red")
						var tmpRecord = {IDAnimal:3};
						libSuperTest('http://localhost:9080/')
						.del('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the count of deleted records.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Count).to.equal(1);
								fDone();
							}
						);
					}
				);
				test
				(
					'delete: delete a record with a missing ID',
					function(fDone)
					{
						// Delete animal but don't provide ID
						var tmpRecord = { Type: 'Corgi' };
						libSuperTest('http://localhost:9080/')
						.del('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the count of deleted records.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('a valid record ID is required');
								fDone();
							}
						);
					}
				);
				test
				(
					'delete: delete a record with a bad ID',
					function(fDone)
					{
						// Delete animal 3 ("Red")
						var tmpRecord = {IDAnimal:{MyStuff:4}};
						libSuperTest('http://localhost:9080/')
						.del('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the count of deleted records.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('a valid record ID is required');
								fDone();
							}
						);
					}
				);
				test
				(
					'count: get the count of records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/Count')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.Count).to.equal(5);
								fDone();
							}
						);
					}
				);
				test
				(
					'count: get the count of filtered records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/Count/FilteredTo/FBV~Type~EQ~Girl')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.Count).to.equal(1);
								fDone();
							}
						);
					}
				);
				test
				(
					'schema: advertises RetoldMetadata version map and capabilities',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/Schema')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults).to.have.property('RetoldMetadata');
								Expect(tmpResults.RetoldMetadata).to.have.property('PackageVersions');
								Expect(tmpResults.RetoldMetadata.PackageVersions).to.have.property('meadow-endpoints');
								Expect(tmpResults.RetoldMetadata.PackageVersions['meadow-endpoints']).to.be.a('string');
								Expect(tmpResults.RetoldMetadata).to.have.property('Capabilities');
								Expect(tmpResults.RetoldMetadata.Capabilities.QueryEndpoint).to.equal(true);
								fDone();
							}
						);
					}
				);
				test
				(
					'schema: get the schema of a record',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/Schema')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								//console.log('SCHEMA --> '+JSON.stringify(tmpResults, null, 4))
								Expect(tmpResults.title).to.equal('Animal');
								Expect(tmpResults.description).to.contain('creature that lives in');
								fDone();
							}
						);
					}
				);
				test
				(
					'new: get a new empty record',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/Schema/New')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResults, null, 4))
								Expect(tmpResults.IDAnimal).to.equal(null);
								Expect(tmpResults.Name).to.equal('Unknown');
								Expect(tmpResults.Type).to.equal('Unclassified');
								fDone();
							}
						);
					}
				);
				test
				(
					'validate: validate an invalid record',
					function(fDone)
					{
						var tmpRecord = {IDAnimal:4, Type:'Corgi'};
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTest/Schema/Validate')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResult, null, 4))
								Expect(tmpResult.Valid).to.equal(false);
								Expect(tmpResult.Errors[0].field).to.equal('data.Name');
								Expect(tmpResult.Errors[0].message).to.equal('is required');
								fDone();
							}
						);
					}
				);
				test
				(
					'validate: validate a valid record',
					function(fDone)
					{
						var tmpRecord = {IDAnimal:4, Type:'Corgi', Name:'Doofer', CreatingIDUser:10};
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTest/Schema/Validate')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResult, null, 4))
								Expect(tmpResult.Valid).to.equal(true);
								fDone();
							}
						);
					}
				);
				test
				(
					'validate: validate bad data',
					function(fDone)
					{
						var tmpRecord = 'IAMBAD';
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTest/Schema/Validate')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.equal('Record validate failure - a valid JSON object is required.');
								fDone();
							}
						);
					}
				);
			}
		);
		suite
		(
			'Unauthorized server routes',
			function()
			{
				test
				(
					'read: get a specific record',
					function(fDone)
					{
						_MockSessionValidUser.UserRoleIndex = -1;
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/2')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('You must be appropriately authenticated');
								_MockSessionValidUser.UserRoleIndex = 1;
								fDone();
							}
						);
					}
				);
			}
		);
		suite
		(
			'Bad user server routes',
			function()
			{
				test
				(
					'create: create a record',
					function(fDone)
					{
						_MockSessionValidUser.UserID = 0;
						var tmpRecord = {Name:'BatBrains', Type:'Mammoth'};
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('authenticated');
								fDone();
							}
						);
					}
				);
				test
				(
					'read: get a specific record',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/2')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('authenticated');
								fDone();
							}
						);
					}
				);
				test
				(
					'readselect: get all records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTestSelect')
						.end(
							function (pError, pResponse)
							{
								console.log(pResponse.text)
								var tmpResults = JSON.parse(pResponse.text);
								Expect(tmpResults.Error).to.contain('authenticated');
								fDone();
							}
						);
					}
				);
				test
				(
					'update: update a record',
					function(fDone)
					{
						// Change animal 4 ("Spot") to a Corgi
						var tmpRecord = {IDAnimal:4, Type:'Corgi'};
						libSuperTest('http://localhost:9080/')
						.put('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('authenticated');
								fDone();
							}
						);
					}
				);
				test
				(
					'schema: get the schema of a record',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/Schema')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								//console.log('SCHEMA --> '+JSON.stringify(tmpResults, null, 4))
								Expect(tmpResults.Error).to.contain('authenticated');
								fDone();
							}
						);
					}
				);
				test
				(
					'new: get a new empty record',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/Schema/New')
						.end(
							function (pError, pResponse)
							{
								var tmpResults = JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResults, null, 4))
								Expect(tmpResults.Error).to.contain('authenticated');
								fDone();
							}
						);
					}
				);
				test
				(
					'validate: validate an invalid record',
					function(fDone)
					{
						var tmpRecord = {IDAnimal:4, Type:'Corgi'};
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTest/Schema/Validate')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResult, null, 4))
								Expect(tmpResult.Error).to.contain('authenticated');
								fDone();

							}
						);
					}
				);
				test
				(
					'count: get the count of records',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTests/Count')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('authenticated');
								fDone();
							}
						);
					}
				);
				test
				(
					'delete: delete a record',
					function(fDone)
					{
						// Delete animal 3 ("Red")
						var tmpRecord = {IDAnimal:3};
						libSuperTest('http://localhost:9080/')
						.del('1.0/FableTest')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the count of deleted records.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('authenticated');
								_MockSessionValidUser.UserID = 10;
								fDone();
							}
						);
					}
				);
			}
		);
		suite
		(
			'Not logged in server routes',
			function()
			{
				test
				(
					'read: get a specific record',
					function(fDone)
					{
						_MockSessionValidUser.LoggedIn = false;
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/2')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('You must be authenticated');
								_MockSessionValidUser.LoggedIn = true;
								fDone();
							}
						);
					}
				);
			}
		);
		suite
		(
			'Filter parser',
			function()
			{
				test
				(
					'Filter parse',
					function(fDone)
					{
						var tmpQuery = _MeadowEndpoints.DAL.query;
						_MeadowEndpoints.parseFilter('FBV~UUIDAnimal~EQ~1000000', tmpQuery);
						Expect(tmpQuery.parameters.filter[0].Column).to.equal('UUIDAnimal');
						fDone();
					}
				);
			}
		);
		suite
		(
			'Changing route requirement',
			function()
			{
				test
				(
					'read: get a specific record',
					function(fDone)
					{
						Expect(_MeadowEndpoints.endpointAuthorizationLevels.Read).to.equal(0);
						fDone();
					}
				);
			}
		);
		suite
		(
			'Behavior modifications',
			function()
			{
				test
				(
					'read: modified get of a specific record',
					function(fDone)
					{
						// Override the query configuration
						_MeadowEndpoints.behaviorModifications.setBehavior('Read-QueryConfiguration', [
							function(pRequest, fComplete)
							{
								//implicitly test behvaior-cascade
								return fComplete(false);
							},
							function(pRequest, fComplete)
							{
								// Turn up logging on the request.
								pRequest.Query.setLogLevel(5);
								fComplete(false);
							} ]);
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/2')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResult, null, 4))
								Expect(tmpResult.Name).to.equal('Red Riding Hood');
								fDone();
							}
						);
					}
				);
				test
				(
					'read: inject data into the record',
					function(fDone)
					{
						// Override the query configuration
						_MeadowEndpoints.behaviorModifications.setBehavior('Read-PostOperation',
							function(pRequest, fComplete)
							{
								// Create a custom property on the record.
								pRequest.Record.CustomProperty = 'Custom '+pRequest.Record.Type+' ID '+pRequest.Record.IDAnimal;
								fComplete(false);
							});
						_MockSessionValidUser.LoggedIn = true;
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/2')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResult, null, 4))
								Expect(tmpResult.CustomProperty).to.equal('Custom Girl ID 2');
								fDone();
							}
						);
					}
				);
				test
				(
					'read-max: get the max record ID',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/Max/IDAnimal')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.IDAnimal).to.equal(6);
								fDone();
							}
						);
					}
				);
				test
				(
					'read-max: get the max name',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/Max/Name')
						.end(
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Name).to.equal('Spot');
								fDone();
							}
						);
					}
				);
			}
		);
		suite
		(
			'Direct invocation',
			function()
			{
				var tmpCreatedRecordGUID;

				test
				(
					'invoke: setup method is called',
					function(fDone)
					{
						_MockSessionValidUser.UserRoleIndex = 2;
						let setupCallCount = 0;
						let passedRequest, passedResponse, passedOriginalRequest;
						_MeadowEndpoints.setInvokeSetupCallback((req, res, origReq) =>
						{
							++setupCallCount;
							passedRequest = req;
							passedResponse = res;
							passedOriginalRequest = origReq;
						});
						const originalRequest = {UserSession: _MockSessionValidUser};
						_MeadowEndpoints.invokeEndpoint('Read', {IDRecord: 2}, originalRequest,
							function(pError, pResponse)
							{
								Expect(setupCallCount).to.equal(1);
								Expect(passedOriginalRequest).to.equal(originalRequest);
								Expect(passedRequest).to.be.an('object');
								Expect(passedResponse).to.be.an('object');

								fDone();
							}
						);
					}
				);
				test
				(
					'invoke create: create a record',
					function(fDone)
					{
						var tmpRecord = {Name:'BatBrains', Type:'Mammoth'};
						_MockSessionValidUser.UserRoleIndex = 2;
						_MeadowEndpoints.invokeEndpoint('Create', tmpRecord, {UserSession: _MockSessionValidUser},
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								Expect(pResponse.body.Name)
									.to.equal(tmpRecord.Name);

								tmpCreatedRecordGUID = pResponse.body.GUIDAnimal;

								fDone();
							}
						);
					}
				);
				test
				(
					'invoke create: create a record with a bad record passed in',
					function(fDone)
					{
						var tmpRecord = ' ';
						_MockSessionValidUser.UserRoleIndex = 2;
						_MeadowEndpoints.invokeEndpoint('Create', tmpRecord,
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('a valid record is required');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke read: get a specific record',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('Read', {IDRecord: 2}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Type).to.equal('Girl');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke read: get a specific record by GUID',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('Read', {GUIDRecord: tmpCreatedRecordGUID}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Type).to.equal('Mammoth');
								fDone();
							}
						);
					}
				);
				test
				(
					'read: get a specific record with a bad parameter',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('Read', {},
							function (pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								//console.log(tmpResult);
								Expect(tmpResult.Error).to.be.an('undefined'); //
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readselect: get all records',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadSelectList', {}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								console.log(pResponse.body)
								Expect(pResponse.body)
									.to.be.an('array');
								//var tmpResults = JSON.parse(pResponse.text);
								//Expect(tmpResults.Error).to.contain('authenticated');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readsby: get all records by Type',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadsBy', {ByField: 'Type', ByValue: 'Mammoth'}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								//console.log(pResponse.body);

								var tmpResults = pResponse.body; //JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[0].Type).to.equal('Mammoth');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readsby: get all records by Type IN LIST',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadsBy', {ByField: 'Type', ByValue: ['Mammoth', 'Dog']}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								//console.log(pResponse.body);

								var tmpResults = pResponse.body; //JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[0].Type).to.equal('Mammoth');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readsby: get all records by Type AND Name',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadsBy', {Filters: [
							{ByField: 'Type', ByValue: 'Mammoth'},
							{ByField: 'Name', ByValue: 'BatBrains'}
							]}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								//console.log(pResponse.body);

								var tmpResults = pResponse.body; //JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[0].Type).to.equal('Mammoth');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke countby: get cout of records by Type',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('CountBy', {ByField: 'Type', ByValue: 'Mammoth'}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								var tmpResults = pResponse.body; //JSON.parse(pResponse.text);
								Expect(tmpResults.Count).to.equal(2);
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readsby: get paged records by Type',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadsBy', {ByField: 'Type', ByValue: 'Mammoth', Begin: 1, Cap: 1}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								var tmpResults = pResponse.body;
								Expect(tmpResults.length).to.equal(1);
								Expect(tmpResults[0].Type).to.equal('Mammoth');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readselect: get a page of records',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadSelectList', {Begin: 2, Cap: 2}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								var tmpResults = pResponse.Records; //JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[1].Value).to.equal('FableTest #5');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readselect: get an empty page of records',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadSelectList', {Begin: 200, Cap: 200}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								var tmpResults = pResponse.Records; //JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(0);
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke reads: get a page of records',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('Reads', {Begin: 2, Cap: 2}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								var tmpResults = pResponse.Records; //JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(2);
								Expect(tmpResults[0].Type).to.equal('Corgi');
								Expect(tmpResults[1].Name).to.equal('Gertrude');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke update: update a record',
					function(fDone)
					{
						// Change animal 4 ("Spot") to a Corgi
						var tmpRecord = {IDAnimal:4, Type:'Corgi'};
						_MeadowEndpoints.invokeEndpoint('Update', tmpRecord, {UserSession: _MockSessionValidUser},
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = pResponse.Record; //JSON.parse(pResponse.text);
								Expect(tmpResult.Type).to.equal('Corgi');
								Expect(tmpResult.CreatingIDUser).to.equal(1);
								Expect(tmpResult.UpdatingIDUser).to.equal(_MockSessionValidUser.UserID);
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke delete: delete a record',
					function(fDone)
					{
						// Delete animal 4 ("Corgi")
						var tmpRecord = {IDAnimal:4};

						// Override the query configuration
						_MeadowEndpoints.behaviorModifications.setBehavior('Delete-PreOperation',
							function(pRequest, fComplete)
							{
								// Create a custom property on the record.
								Expect(pRequest.Record.IDAnimal).to.equal(tmpRecord.IDAnimal);
								return fComplete(false);
							});

						_MeadowEndpoints.invokeEndpoint('Delete', tmpRecord, {UserSession: _MockSessionValidUser},
							function(pError, pResponse)
							{
								//clear out the behavior mapping to not affect other tests
								_MeadowEndpoints.behaviorModifications.setBehavior('Delete-PreOperation', null);

								// Expect response to be the count of deleted records.
								var tmpResult = pResponse.body; //JSON.parse(pResponse.text);
								Expect(tmpResult.Count).to.equal(1);
								return fDone();
							}
						);
					}
				);
				test
				(
					'invoke delete: delete a record with a bad parameter',
					function(fDone)
					{
						// Delete animal 3 ("Red")
						var tmpRecord = {IDAnimal:{MyStuff:4}};
						_MeadowEndpoints.invokeEndpoint('Delete', tmpRecord, {UserSession: _MockSessionValidUser},
							function(pError, pResponse)
							{
								// Expect response to be the count of deleted records.
								var tmpResult = pResponse.body; //JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('a valid record ID is required');
								fDone();
							}
						);
					}
				);
				test
				(
					'count: get the count of records',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('Count', {}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								var tmpResults = pResponse.body; //JSON.parse(pResponse.text);
								Expect(tmpResults.Count).to.equal(5);
								fDone();
							}
						);
					}
				);
				test
				(
					'schema: get the schema of a record',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('Schema', {},
							function (pError, pResponse)
							{
								var tmpResults = pResponse.body; //JSON.parse(pResponse.text);
								//console.log('SCHEMA --> '+JSON.stringify(tmpResults, null, 4))
								Expect(tmpResults.title).to.equal('Animal');
								Expect(tmpResults.description).to.contain('creature that lives in');
								fDone();
							}
						);
					}
				);
				test
				(
					'new: get a new empty record',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('New', {}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								var tmpResults = pResponse.body; //JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResults, null, 4))
								Expect(tmpResults.IDAnimal).to.equal(null);
								Expect(tmpResults.Name).to.equal('Unknown');
								Expect(tmpResults.Type).to.equal('Unclassified');
								fDone();
							}
						);
					}
				);
				test
				(
					'validate: validate an invalid record',
					function(fDone)
					{
						var tmpRecord = {IDAnimal:4, Type:'Corgi'};
						_MeadowEndpoints.invokeEndpoint('Validate', tmpRecord, {UserSession: _MockSessionValidUser},
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = pResponse.body; //JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResult, null, 4))
								Expect(tmpResult.Valid).to.equal(false);
								Expect(tmpResult.Errors[0].field).to.equal('data.Name');
								Expect(tmpResult.Errors[0].message).to.equal('is required');
								fDone();
							}
						);
					}
				);
				test
				(
					'validate: validate a valid record',
					function(fDone)
					{
						var tmpRecord = {IDAnimal:4, Type:'Corgi', Name:'Doofer', CreatingIDUser:10};
						_MeadowEndpoints.invokeEndpoint('Validate', tmpRecord, {UserSession: _MockSessionValidUser},
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = pResponse.body; //JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResult, null, 4))
								Expect(tmpResult.Valid).to.equal(true);
								fDone();
							}
						);
					}
				);
				test
				(
					'validate: validate bad data',
					function(fDone)
					{
						var tmpRecord = 'IAMBAD';
						_MeadowEndpoints.invokeEndpoint('Validate', tmpRecord, {UserSession: _MockSessionValidUser},
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = pResponse.body; //JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResult, null, 4))
								Expect(tmpResult.Error).to.contain('validate failure');
								fDone();
							}
						);
					}
				);
			}
		);

		suite
		(
			'Endpoint Security - Deny',
			function()
			{
				test
				(
					'invoke read: get a specific record',
					function(fDone)
					{
						_MockSessionValidUser.LoggedIn = true;
						_MockSessionValidUser.UserRoleIndex = 5; //set it to an undefined role, so the DefaultAPISecurity definitions of 'Deny' get used.

						_MeadowEndpoints.invokeEndpoint('Read', {IDRecord: 2}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								Expect(pResponse.body.ErrorCode).to.equal(405);
								Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');
								return fDone();
							}
						);
					}
				);
				test
				(
					'invoke create: create a record',
					function(fDone)
					{
						var tmpRecord = {Name:'BatBrains', Type:'Mammoth'};
						_MeadowEndpoints.invokeEndpoint('Create', tmpRecord, {UserSession: _MockSessionValidUser},
							function(pError, pResponse)
							{
								Expect(pResponse.body.ErrorCode).to.equal(405);
								Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');

								return fDone();
							}
						);
					}
				);
				test
				(
					'invoke create: create a record with a bad record passed in',
					function(fDone)
					{
						var tmpRecord = ' ';
						_MeadowEndpoints.invokeEndpoint('Create', tmpRecord, {UserSession: _MockSessionValidUser},
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Error).to.contain('a valid record is required');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readselect: get all records',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadSelectList', {}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								Expect(pResponse.body.ErrorCode).to.equal(405);
								Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');

								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readsby: get all records by Type',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadsBy', {ByField: 'Type', ByValue: 'Mammoth'}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								Expect(pResponse.body.ErrorCode).to.equal(405);
								Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readsby: get all records by Type IN LIST',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadsBy', {ByField: 'Type', ByValue: ['Mammoth', 'Dog']}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								Expect(pResponse.body.ErrorCode).to.equal(405);
								Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke countby: get cout of records by Type',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('CountBy', {ByField: 'Type', ByValue: 'Mammoth'}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								Expect(pResponse.body.ErrorCode).to.equal(405);
								Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke countby: get cout of records by Type',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('Count', {}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								Expect(pResponse.body.ErrorCode).to.equal(405);
								Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readselect: get a page of records',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadSelectList', {Begin: 2, Cap: 2}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								Expect(pResponse.body.ErrorCode).to.equal(405);
								Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readselect: get an empty page of records',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadSelectList', {Begin: 200, Cap: 200}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								// Because no records were returned, it should show as Authorized

								var tmpResults = pResponse.Records; //JSON.parse(pResponse.text);
								Expect(tmpResults.length).to.equal(0);
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke reads: get a page of records',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('Reads', {Begin: 2, Cap: 2}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								Expect(pResponse.body.ErrorCode).to.equal(405);
								Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');

								fDone();
							}
						);
					}
				);
				test
				(
					'invoke update: update a record',
					function(fDone)
					{
						// Change animal 1
						var tmpRecord = {IDAnimal:1, Type:'Corgi'};
						_MeadowEndpoints.invokeEndpoint('Update', tmpRecord, {UserSession: _MockSessionValidUser},
							function(pError, pResponse)
							{
								Expect(pResponse.body.ErrorCode).to.equal(405);
								Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');

								fDone();
							}
						);
					}
				);
				test
				(
					'invoke update: update a record, override security to authorize the request',
					function(fDone)
					{
						// Change animal 1
						var tmpRecord = {IDAnimal:1, Type:'Corgi'};
						_MeadowEndpoints.invokeEndpoint('Update', tmpRecord, {UserSession: _MockSessionValidUser, Satchel: {AuthorizeOverride: true}},
							function(pError, pResponse)
							{
								// Expect response to be the record we just updated.
								var tmpResult = pResponse.Record; //JSON.parse(pResponse.text);
								Expect(tmpResult.Type).to.equal('Corgi');
								Expect(tmpResult.CreatingIDUser).to.equal(1);
								Expect(tmpResult.UpdatingIDUser).to.equal(_MockSessionValidUser.UserID);

								fDone();
							}
						);
					}
				);
				test
				(
					'invoke delete: delete a record',
					function(fDone)
					{
						// Delete animal 1
						var tmpRecord = {IDAnimal:1};
						_MeadowEndpoints.invokeEndpoint('Delete', tmpRecord, {UserSession: _MockSessionValidUser},
							function(pError, pResponse)
							{
								Expect(pResponse.body.ErrorCode).to.equal(405);
								Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');

								fDone();
							}
						);
					}
				);
				test
				(
					'bulk creates',
					function(fDone)
					{
						var tmpRecords = [
							{Name:'Billy', Type:'Cat'},
							{Name:'Jim', Type:'Cat'},
							{Name:'Janet', Type:'Cat'},
							{Name:'Sweeps', Type:'Cat'},
							{Name:'Stakes', Type:'Dog'},
							{Name:'Sally', Type:'Dog'},
							{Name:'Bill', Type:'Dog'},
							{Name:'Chris', Type:'Dog'},
							{Name:'Haji', Type:'Snake'}
						];
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTests')
						.send(tmpRecords)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResult,null,4));
								Expect(tmpResult[0].Name).to.equal('Billy');
								Expect(tmpResult[5].Type).to.equal('Dog');
								fDone();
							}
						);
					}
				);
				test
				(
					'bulk create with a bad record',
					function(fDone)
					{
						var tmpRecords = [
							{Name:'Astro', Type:'Cartoon'},
							{Name:'Boy', Type:'Cartoon'},
							{License:'Whoops', Type:'Cat'},
							{Name:'Froggy', Type:'Cartoon'}
						];
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTests')
						.send(tmpRecords)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult[0].Type).to.equal('Cartoon');
								fDone();
							}
						);
					}
				);
				test
				(
					'bulk updates',
					function(fDone)
					{
						var tmpRecords = [
							{IDAnimal: 11, Type:'Hoss'},
							{IDAnimal: 12, Type:'Hoss'},
							{IDAnimal: 14, Type:'Hoss'},
							{IDAnimal: 15, Type:'Hoss'}
						];
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.put('1.0/FableTests')
						.send(tmpRecords)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResult,null,4));
								Expect(tmpResult[0].IDAnimal).to.equal(11);
								Expect(tmpResult[0].Type).to.equal('Hoss');
								Expect(tmpResult[1].Type).to.equal('Hoss');
								Expect(tmpResult[2].Type).to.equal('Hoss');
								Expect(tmpResult[3].Type).to.equal('Hoss');
								fDone();
							}
						);
					}
				);
				test
				(
					'bulk updates with bad record',
					function(fDone)
					{
						var tmpRecords = [
							{IDAnimal: 11, Type:'Horsse'},
							{IDAnimal: 12, Type:'Horsse'},
							{IDAnimal: 14, Genus:'Hosse'},
							{IDAnimal: 15, Type:'Hosses'}
						];
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.put('1.0/FableTests')
						.send(tmpRecords)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								//console.log(JSON.stringify(tmpResult,null,4));
								Expect(tmpResult[3].Type).to.equal('Hosses');
								fDone();
							}
						);
					}
				);
				test
				(
					'invoke readlite: get all records',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('ReadLiteList', {}, {UserSession: _MockSessionValidUser},
							function (pError, pResponse)
							{
								//console.log(pResponse.body)
								Expect(pResponse.body)
									.to.be.an('array');
								//var tmpResults = JSON.parse(pResponse.text);
								//Expect(tmpResults.Error).to.contain('authenticated');
								fDone();
							}
						);
					}
				);
				test
				(
					'upsert: create a record',
					function(fDone)
					{
						var tmpRecord = {GUIDAnimal:'0xHAXXXX', Name:'Jason', Type:'Tyranosaurus'};
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.put('1.0/FableTest/Upsert')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								//console.log(pResponse.text)
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Type).to.equal('Tyranosaurus');
								Expect(tmpResult.CreatingIDUser).to.equal(10);
								fDone();
							}
						);
					}
				);
				test
				(
					'upsert: Update a record',
					function(fDone)
					{
						var tmpRecord = {GUIDAnimal:'0xHAXXXX', Type:'Stegosaurus'};
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.put('1.0/FableTest/Upsert')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								console.log(pResponse.text)
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Type).to.equal('Stegosaurus');
								Expect(tmpResult.Name).to.equal('Jason');
								fDone();
							}
						);
					}
				);
				test
				(
					'bulk upserts',
					function(fDone)
					{
						_MeadowEndpoints.behaviorModifications.setTemplate('SelectList', '<%= Record.Name %>|<%=Record.Type%>');
						var tmpRecords = [
							{GUIDAnimal:'0xHAXXXX', Type:'Triceratops'},
							{GUIDAnimal:'0xDavison', Name:'Davison', Type:'Dog'},
							{GUIDAnimal:'0xMartino', Name:'Martin', Type:'Dog'},
							{Name:'Chino', Type:'Cat'}
						];
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.put('1.0/FableTest/Upserts')
						.send(tmpRecords)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								console.log(JSON.stringify(tmpResult,null,4));
								Expect(tmpResult[0].Value).to.equal('Jason|Triceratops');
								Expect(tmpResult[1].Value).to.equal('Davison|Dog');
								Expect(tmpResult[2].Value).to.equal('Martin|Dog');
								Expect(tmpResult[3].Value).to.equal('Chino|Cat');
								fDone();
							}
						);
					}
				);
				test
				(
					'problematic bulk upserts',
					function(fDone)
					{
						_MeadowEndpoints.behaviorModifications.setTemplate('SelectList', '<%= Record.Name %>|<%=Record.Type%>');
						var tmpRecords = [
							{GUIDAnimal:'0xHAXXXX', TypeOh:'Triceratops'},
							{GUIDAnimal:'0xDavison', Nameology:'Davison', Type:'Dog'},
							{GUIDAnimal:'0xMartino', Name:'Martin', Type:'Dog'}, // this one still works
						];
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.put('1.0/FableTest/Upserts')
						.send(tmpRecords)
						.end(
							function(pError, pResponse)
							{
								// Expect response to be the record we just created.
								var tmpResult = JSON.parse(pResponse.text);
								console.log(JSON.stringify(tmpResult,null,4));
								Expect(tmpResult[0].Error).to.be.a('string');
								Expect(tmpResult[1].Error).to.be.a('string');
								Expect(tmpResult[2].Error).to.not.exist;
								fDone();
							}
						);
					}
				);
				// A null GUID clears the `typeof !== 'undefined'` guard in the
				// upsert identifier check, so the `.length` read after it used
				// to throw out of the waterfall rather than falling through to
				// a create.
				test
				(
					'upsert: a null GUID is treated as absent, not dereferenced',
					function(fDone)
					{
						var tmpRecord = {GUIDAnimal:null, Name:'Nullo', Type:'Pterodactyl'};
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.put('1.0/FableTest/Upsert')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								// Expect a created record back, not a 500.
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Name).to.equal('Nullo');
								Expect(tmpResult.Type).to.equal('Pterodactyl');
								Expect(tmpResult.IDAnimal).to.be.above(0);
								fDone();
							}
						);
					}
				);
				test
				(
					'upsert: a null default identifier is treated as absent',
					function(fDone)
					{
						var tmpRecord = {IDAnimal:null, Name:'Nullid', Type:'Ichthyosaur'};
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.put('1.0/FableTest/Upsert')
						.send(tmpRecord)
						.end(
							function(pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								Expect(tmpResult.Name).to.equal('Nullid');
								Expect(tmpResult.Type).to.equal('Ichthyosaur');
								Expect(tmpResult.IDAnimal).to.be.above(0);
								fDone();
							}
						);
					}
				);
				// A throw inside doUpsert escapes eachSeries, so it takes down
				// the whole batch rather than being isolated to its own record
				// the way a data error is. The second record proves the batch
				// kept going.
				test
				(
					'bulk upserts: a null GUID on one record does not fail the batch',
					function(fDone)
					{
						_MeadowEndpoints.behaviorModifications.setTemplate('SelectList', '<%= Record.Name %>|<%=Record.Type%>');
						var tmpRecords = [
							{GUIDAnimal:null, Name:'Nullbulk', Type:'Plesiosaur'},
							{GUIDAnimal:'0xMartino', Name:'Martin', Type:'Wolfhound'}
						];
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.put('1.0/FableTest/Upserts')
						.send(tmpRecords)
						.end(
							function(pError, pResponse)
							{
								var tmpResult = JSON.parse(pResponse.text);
								console.log(JSON.stringify(tmpResult,null,4));
								Expect(tmpResult[0].Value).to.equal('Nullbulk|Plesiosaur');
								Expect(tmpResult[1].Value).to.equal('Martin|Wolfhound');
								fDone();
							}
						);
					}
				);
			}
		);
		suite
		(
			'Undelete',
			function()
			{
				var _IDUndeleteAnimal = 0;

				test
				(
					'undelete: create then delete a record to work with',
					function(fDone)
					{
						_MockSessionValidUser.UserRoleIndex = 2;
						libSuperTest('http://localhost:9080/')
						.post('1.0/FableTest')
						.send({Name:'Lazarus', Type:'Phoenix'})
						.end(
							function(pError, pResponse)
							{
								var tmpRecord = JSON.parse(pResponse.text);
								Expect(tmpRecord.IDAnimal).to.be.above(0);
								_IDUndeleteAnimal = tmpRecord.IDAnimal;

								libSuperTest('http://localhost:9080/')
								.del('1.0/FableTest/'+_IDUndeleteAnimal)
								.end(
									function(pDeleteError, pDeleteResponse)
									{
										Expect(JSON.parse(pDeleteResponse.text).Count).to.equal(1);
										fDone();
									}
								);
							}
						);
					}
				);
				test
				(
					'undelete: a deleted record is not readable',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/'+_IDUndeleteAnimal)
						.end(
							function(pError, pResponse)
							{
								Expect(JSON.parse(pResponse.text).Error).to.contain('Record not found');
								fDone();
							}
						);
					}
				);
				test
				(
					'undelete: restore a deleted record',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/Undelete/'+_IDUndeleteAnimal)
						.end(
							function(pError, pResponse)
							{
								Expect(JSON.parse(pResponse.text).Count).to.equal(1);
								fDone();
							}
						);
					}
				);
				test
				(
					'undelete: the restored record is readable again',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/'+_IDUndeleteAnimal)
						.end(
							function(pError, pResponse)
							{
								var tmpRecord = JSON.parse(pResponse.text);
								Expect(tmpRecord.IDAnimal).to.equal(_IDUndeleteAnimal);
								Expect(tmpRecord.Name).to.equal('Lazarus');
								Expect(tmpRecord.Deleted).to.equal(0);
								fDone();
							}
						);
					}
				);
				test
				(
					'undelete: undeleting a record which is not deleted changes nothing',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/Undelete/'+_IDUndeleteAnimal)
						.end(
							function(pError, pResponse)
							{
								Expect(JSON.parse(pResponse.text).Count).to.equal(0);
								fDone();
							}
						);
					}
				);
				test
				(
					'undelete: undelete a record with a bad ID',
					function(fDone)
					{
						libSuperTest('http://localhost:9080/')
						.get('1.0/FableTest/Undelete/NotAnIdentifier')
						.end(
							function(pError, pResponse)
							{
								Expect(JSON.parse(pResponse.text).Error).to.contain('a valid record ID is required');
								fDone();
							}
						);
					}
				);
				test
				(
					'undelete: pre and post operation behaviors are invoked',
					function(fDone)
					{
						var tmpBehaviorsInvoked = [];

						_MeadowEndpoints.behaviorModifications.setBehavior('Undelete-PreOperation',
							function(pRequest, fComplete)
							{
								Expect(pRequest.Record.IDAnimal).to.equal(_IDUndeleteAnimal);
								tmpBehaviorsInvoked.push('Pre');
								return fComplete(false);
							});
						_MeadowEndpoints.behaviorModifications.setBehavior('Undelete-PostOperation',
							function(pRequest, fComplete)
							{
								tmpBehaviorsInvoked.push('Post');
								return fComplete(false);
							});

						libSuperTest('http://localhost:9080/')
						.del('1.0/FableTest/'+_IDUndeleteAnimal)
						.end(
							function(pDeleteError, pDeleteResponse)
							{
								libSuperTest('http://localhost:9080/')
								.get('1.0/FableTest/Undelete/'+_IDUndeleteAnimal)
								.end(
									function(pError, pResponse)
									{
										//clear out the behavior mapping to not affect other tests
										_MeadowEndpoints.behaviorModifications.setBehavior('Undelete-PreOperation', null);
										_MeadowEndpoints.behaviorModifications.setBehavior('Undelete-PostOperation', null);

										Expect(JSON.parse(pResponse.text).Count).to.equal(1);
										Expect(tmpBehaviorsInvoked).to.deep.equal(['Pre', 'Post']);
										fDone();
									}
								);
							}
						);
					}
				);
				test
				(
					'invoke undelete: restore a deleted record',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('Delete', {IDAnimal:_IDUndeleteAnimal}, {UserSession: _MockSessionValidUser},
							function(pDeleteError, pDeleteResponse)
							{
								Expect(pDeleteResponse.body.Count).to.equal(1);

								_MeadowEndpoints.invokeEndpoint('Undelete', {IDAnimal:_IDUndeleteAnimal}, {UserSession: _MockSessionValidUser},
									function(pError, pResponse)
									{
										Expect(pResponse.body.Count).to.equal(1);
										return fDone();
									}
								);
							}
						);
					}
				);
				// Schemas predate the Undelete endpoint, so none of them define an Undelete
				// authorizer; it has to be governed by the Delete authorizer instead of falling
				// through to the permissive default.
				test
				(
					'undelete: a role denied Delete is denied Undelete',
					function(fDone)
					{
						_MeadowEndpoints.invokeEndpoint('Delete', {IDAnimal:_IDUndeleteAnimal}, {UserSession: _MockSessionValidUser},
							function(pDeleteError, pDeleteResponse)
							{
								Expect(pDeleteResponse.body.Count).to.equal(1);

								//set it to an undefined role, so the DefaultAPISecurity definitions of 'Deny' get used.
								_MockSessionValidUser.UserRoleIndex = 5;

								_MeadowEndpoints.invokeEndpoint('Undelete', {IDAnimal:_IDUndeleteAnimal}, {UserSession: _MockSessionValidUser},
									function(pError, pResponse)
									{
										_MockSessionValidUser.UserRoleIndex = 2;

										Expect(pResponse.body.ErrorCode).to.equal(405);
										Expect(pResponse.body.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');
										return fDone();
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
