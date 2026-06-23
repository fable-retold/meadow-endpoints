/**
* Meadow Data Broker Library
*
* @license MIT
*
* @author Steven Velozo <steven@velozo.com>
* @module Meadow
*/

//Meadow needs to connect some general route handlers, this ensures it is done lazily, and only once.
var _AttachedRequestHandlers = false;

/**
* Meadow Data Broker Library
*
* @class MeadowEndpoints
* @constructor
*/
var MeadowEndpoints = function()
{
	function createNew(pMeadow)
	{
		// If a valid Fable object isn't passed in, return a constructor
		if ((typeof(pMeadow) !== 'object') || !('fable' in pMeadow))
		{
			return {new: createNew};
		}
		var _Meadow = pMeadow;
		var _Fable = pMeadow.fable;

		var libAsync = require('async');
		var libRestRouteParse = require('./Restify-RouteParser.js');

		var _CommonServices = require('./Meadow-CommonServices.js').new(pMeadow);

		// This holds any changed behaviors.
		var _BehaviorModifications = require('./Meadow-BehaviorModifications.js').new(pMeadow);

		// This holds the authorizers.
		var _Authorizers = require('./Meadow-Authorizers.js').new(pMeadow);

		// This checks that the user is authenticated.  In the future, it will be overloadable.
		var _Authenticator = require('./Meadow-Authenticator.js');

		// The default endpoints
		var _Endpoints = (
		{
			Create: require('./crud/Meadow-Endpoint-Create.js'),
			Creates: require('./crud/Meadow-Endpoint-BulkCreate.js'),

			Read: require('./crud/Meadow-Endpoint-Read.js'),
			ReadMax: require('./crud/Meadow-Endpoint-ReadMax.js'),

			Reads: require('./crud/Meadow-Endpoint-Reads.js'),
			ReadsBy: require('./crud/Meadow-Endpoint-ReadsBy.js'),

			// Body-driven read: filter/pagination/mode travel in a JSON POST body
			Query: require('./crud/Meadow-Endpoint-Query.js'),

			ReadSelectList: require('./crud/Meadow-Endpoint-ReadSelectList.js'),
			ReadLiteList: require('./crud/Meadow-Endpoint-ReadLiteList.js'),
			ReadDistinctList: require('./crud/Meadow-Endpoint-ReadDistinctList.js'),

			Update: require('./crud/Meadow-Endpoint-Update.js'),
			Updates: require('./crud/Meadow-Endpoint-BulkUpdate.js'),

			Upsert: require('./crud/Meadow-Endpoint-Upsert.js'),
			Upserts: require('./crud/Meadow-Endpoint-BulkUpsert.js'),

			Delete: require('./crud/Meadow-Endpoint-Delete.js'),

			Count: require('./crud/Meadow-Endpoint-Count.js'),
			CountBy: require('./crud/Meadow-Endpoint-CountBy.js'),

		// Get the JSONSchema spec schema
		/* http://json-schema.org/examples.html
		 * http://json-schema.org/latest/json-schema-core.html
		 */
			Schema: require('./schema/Meadow-Endpoint-Schema.js'),
			// Validate a passed-in JSON object for if it matches the schema
			Validate: require('./schema/Meadow-Endpoint-Validate.js'),
			// Get an empty initialized JSON object for this.
			New: require('./schema/Meadow-Endpoint-New.js')
		});

		/**
		* Customize a default endpoint (or create more)
		*
		* @method setEndpoint
		*/
		var setEndpoint = function(pEndpointHash, fEndpoint)
		{
			if (typeof(fEndpoint) === 'function')
			{
				_Endpoints[pEndpointHash] = fEndpoint;
			}

			return this;
		};


		// The default authenticators
		var _EndpointAuthenticators = (
		{
			Create: _Authenticator,
			Read: _Authenticator,
			Reads: _Authenticator,
			Update: _Authenticator,
			Delete: _Authenticator,
			Count: _Authenticator,

			Schema: _Authenticator,
			Validate: _Authenticator,
			New: _Authenticator
		});

		/**
		* Customize an endpoint Authenticator
		*
		* @method setEndpointAuthenticator
		*/
		var setEndpointAuthenticator = function(pEndpointHash, fAuthenticator)
		{
			if (typeof(fAuthenticator) === 'function')
			{
				_EndpointAuthenticators[pEndpointHash] = fAuthenticator;
			}

			return this;
		};


		// The default endpoint authorization levels
		var _EndpointAuthorizationLevels = (
		{
			Create: 1,
			Read: 0,
			Reads: 0,
			Update: 1,
			Delete: 1,
			Count: 0,

			Schema: 0,
			Validate: 0,
			New: 1
		});


		// The default behaviors available.
		// Turning these off before wiring the endpoints up will result in their counterpart endpoints not being available.
		var _EnabledBehaviors = (
		{
			Create: true,
			// POST  [/1.0/SomeEndpoint]

			Read: true,
			// GET  [/1.0/SomeEndpoint/:IDRecord]
			// GET  [/1.0/SomeEndpoint/Max/:ColumnName]

			Reads: true,
			// GET  [/1.0/SomeEndpoints]
			// GET  [/1.0/SomeEndpoints/:Begin/:Cap]
			// GET  [/1.0/SomeEndpoints/By/:ByField/:ByValue]
			// GET  [/1.0/SomeEndpoints/By/:ByField/:ByValue/:Begin/:Cap]
			// GET  [/1.0/SomeEndpoints/FilteredTo/:Filter]
			// GET  [/1.0/SomeEndpoints/FilteredTo/:Filter/:Begin/:Cap]
			// GET  [/1.0/SomeEndpointSelect]
			// GET  [/1.0/SomeEndpointSelect/:Begin/:Cap]
			// GET  [/1.0/SomeEndpointSelect/FilteredTo/:Filter]
			// GET  [/1.0/SomeEndpointSelect/FilteredTo/:Filter/:Begin/:Cap]
			// GET  [/1.0/SomeEndpoint/Lite]
			// GET  [/1.0/SomeEndpoint/Lite/:Begin/:Cap]
			// GET  [/1.0/SomeEndpoint/Lite/FilteredTo/:Filter]
			// GET  [/1.0/SomeEndpoint/Lite/FilteredTo/:Filter/:Begin/:Cap]
			// GET  [/1.0/SomeEndpoint/LiteExtended/:ExtraColumns]
			// GET  [/1.0/SomeEndpoint/LiteExtended/:ExtraColumns/:Begin/:Cap]
			// GET  [/1.0/SomeEndpoint/LiteExtended/:ExtraColumns/FilteredTo/:Filter]
			// GET  [/1.0/SomeEndpoint/LiteExtended/:ExtraColumns/FilteredTo/:Filter/:Begin/:Cap]
			// GET  [/1.0/SomeEndpoint/Distinct/:Columns]
			// GET  [/1.0/SomeEndpoint/Distinct/:Columns/:Begin/:Cap]
			// GET  [/1.0/SomeEndpoint/Distinct/:Columns/FilteredTo/:Filter]
			// GET  [/1.0/SomeEndpoint/Distinct/:Columns/FilteredTo/:Filter/:Begin/:Cap]

			Update: true,
			// PUT [/1.0/SomeEndpoint]
			// PUT  [/1.0/SomeEndpoint/Upsert]

			Delete: true,
			// DEL  [/1.0/SomeEndpoint]
			// DEL  [/1.0/SomeEndpoint/:IDRecord]

			Count: true,
			// GET  [/1.0/SomeEndpoints/Count]
			// GET  [/1.0/SomeEndpoints/Count/By/:ByField/:ByValue]
			// GET  [/1.0/SomeEndpoints/Count/FilteredTo/:Filter]

			Schema: true,
			// GET  [/1.0/SomeEndpoint/Schema]

			Validate: true,
			// POST [/1.0/SomeEndpoint/Schema/Validate]

			New: true
			// GET  [/1.0/SomeEndpoint/Schema/New]
		});

		/**
		* Customize an endpoint Authorization Level
		*
		* @method setEndpointAuthorization
		*/
		var setEndpointAuthorization = function(pEndpointHash, pAuthorizationLevel)
		{
			_EndpointAuthorizationLevels[pEndpointHash] = pAuthorizationLevel;
			return true;
		};


		/**
		* Add the common services object to the request early in the route chain
		*/
		var wireCommonServices = function (pRequest, pResponse, fNext)
		{
			// TODO: There is a shared state issue with using this as the source for the authorization levels.  Fix it.
			pRequest.CommonServices = _CommonServices;
			fNext();
		};


		/**
		* Add the explicit state to the request that is coming through this endpoint
		*/
		var wireState = function (pRequest, pResponse, fNext)
		{
			// TODO: There is a shared state issue with using this as the source for the authorization levels.  Fix it.
			pRequest.EndpointAuthorizationLevels = _EndpointAuthorizationLevels;
			pRequest.DAL = _Meadow;
			pRequest.BehaviorModifications = _BehaviorModifications;
			pRequest.Authorizers = _Authorizers;
			pRequest.forEachRecord = function(fIterator)
			{
				if (pRequest.Record)
					return fIterator(pRequest.Record)
				else if (pRequest.Records)
					return pRequest.Records.forEach(fIterator);
			}

			//maximum number of records to return by default on Read queries. Override via "MeadowDefaultMaxCap" fable setting.
			pRequest.DEFAULT_MAX_CAP = (_Fable.settings['MeadowDefaultMaxCap']) || 250;

			fNext();
		};

		/**
		* Reparse route parameters, attach 'formattedParams' to Request obj
		*/
		var formatRouteParams = function(pRequest, pResponse, fNext)
		{
			if (pRequest.method === 'GET')
			{
				var tmpParams = libRestRouteParse(
					pRequest.route.path,
					pRequest.url
				);

				for(var key in tmpParams)
				{
					var tmpArray = tmpParams[key].split(',');
					if (tmpArray.length > 1)
					{
						for(var i=0; i<tmpArray.length; i++)
						{
							tmpArray[i] = decodeURIComponent(tmpArray[i]);
						}

						tmpParams[key] = tmpArray;
					}
					else
					{
						tmpParams[key] = decodeURIComponent(tmpParams[key]);
					}
				}

				pRequest.formattedParams = tmpParams;
			}

			//libRestRouteParse
			return fNext();
		};


		/**
		* Wire up routes for the API
		*
		* @method connectRoutes
		* @param {Object} pRestServer The Restify server object to add routes to
		*/
		var connectRoutes = function(pRestServer)
		{
			// TODO: Pull version from the config file.
			const tmpEndpointVersion = _Fable.settings.MeadowEndpointVersion || '1.0';
			// TODO: Allow the user to override the endpoint "name" eventually.
			const tmpEndpointName = _Meadow.scope;

			_Fable.log.trace('Creating endpoint', { Version: tmpEndpointVersion, Name: tmpEndpointName });

			const tmpEndpointPrefix = `/${tmpEndpointVersion}/${tmpEndpointName}`;

			if (!_AttachedRequestHandlers)
			{
				_AttachedRequestHandlers = true;
				// Connect the common services to the route
				pRestServer.use(wireCommonServices);

				// Build formattedParams route parameters
				pRestServer.use(formatRouteParams);
			}

			// These special schema services must come in the route table before the READ because they
			// technically block out the routes for the IDRecord 'Schema' (e.g. /1.0/EntityName/Schema)
			if (_EnabledBehaviors.Schema)
			{
				pRestServer.get(`${tmpEndpointPrefix}/Schema`, _EndpointAuthenticators.Schema, wireState, _Endpoints.Schema);
			}
			if (_EnabledBehaviors.New)
			{
				pRestServer.get(`${tmpEndpointPrefix}/Schema/New`, _EndpointAuthenticators.New, wireState, _Endpoints.New);
			}
			if (_EnabledBehaviors.Validate)
			{
				pRestServer.post(`${tmpEndpointPrefix}/Schema/Validate`, _CommonServices.bodyParser(), _EndpointAuthenticators.Validate, wireState, _Endpoints.Validate);
			}

			// Custom single record endpoints

			// Standard CRUD and Count endpoints
			if (_EnabledBehaviors.Create)
			{
				pRestServer.post(`${tmpEndpointPrefix}`, _CommonServices.bodyParser(), _EndpointAuthenticators.Create, wireState, _Endpoints.Create);
				pRestServer.post(`${tmpEndpointPrefix}s`, _CommonServices.bodyParser(), _EndpointAuthenticators.Create, wireState, _Endpoints.Creates);
			}
			if (_EnabledBehaviors.Read)
			{
				pRestServer.get(`${tmpEndpointPrefix}/Max/:ColumnName`, _EndpointAuthenticators.Read, wireState, _Endpoints.ReadMax);
				pRestServer.get(`${tmpEndpointPrefix}/:IDRecord`, _EndpointAuthenticators.Read, wireState, _Endpoints.Read);
			}
			if (_EnabledBehaviors.Reads)
			{
				pRestServer.post(`${tmpEndpointPrefix}s/Query`, _CommonServices.bodyParser(), _EndpointAuthenticators.Reads, wireState, _Endpoints.Query);
				pRestServer.get(`${tmpEndpointPrefix}s`, _EndpointAuthenticators.Reads, wireState, _Endpoints.Reads);
				pRestServer.get(`${tmpEndpointPrefix}s/By/:ByField/:ByValue`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadsBy);
				pRestServer.get(`${tmpEndpointPrefix}s/By/:ByField/:ByValue/:Begin/:Cap`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadsBy);
				pRestServer.get(`${tmpEndpointPrefix}s/FilteredTo/:Filter`, _EndpointAuthenticators.Reads, wireState, _Endpoints.Reads);
				pRestServer.get(`${tmpEndpointPrefix}s/FilteredTo/:Filter/:Begin/:Cap`, _EndpointAuthenticators.Reads, wireState, _Endpoints.Reads);
				pRestServer.get(`${tmpEndpointPrefix}Select`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadSelectList);
				pRestServer.get(`${tmpEndpointPrefix}Select/FilteredTo/:Filter`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadSelectList);
				pRestServer.get(`${tmpEndpointPrefix}Select/FilteredTo/:Filter/:Begin/:Cap`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadSelectList);
				pRestServer.get(`${tmpEndpointPrefix}Select/:Begin/:Cap`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadSelectList);
				pRestServer.get(`${tmpEndpointPrefix}s/Lite`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadLiteList);
				pRestServer.get(`${tmpEndpointPrefix}s/Lite/FilteredTo/:Filter`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadLiteList);
				pRestServer.get(`${tmpEndpointPrefix}s/Lite/FilteredTo/:Filter/:Begin/:Cap`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadLiteList);
				pRestServer.get(`${tmpEndpointPrefix}s/Lite/:Begin/:Cap`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadLiteList);
				pRestServer.get(`${tmpEndpointPrefix}s/LiteExtended/:ExtraColumns`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadLiteList);
				pRestServer.get(`${tmpEndpointPrefix}s/LiteExtended/:ExtraColumns/FilteredTo/:Filter`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadLiteList);
				pRestServer.get(`${tmpEndpointPrefix}s/LiteExtended/:ExtraColumns/FilteredTo/:Filter/:Begin/:Cap`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadLiteList);
				pRestServer.get(`${tmpEndpointPrefix}s/LiteExtended/:ExtraColumns/:Begin/:Cap`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadLiteList);
				pRestServer.get(`${tmpEndpointPrefix}s/Distinct/:Columns`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadDistinctList);
				pRestServer.get(`${tmpEndpointPrefix}s/Distinct/:Columns/FilteredTo/:Filter`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadDistinctList);
				pRestServer.get(`${tmpEndpointPrefix}s/Distinct/:Columns/FilteredTo/:Filter/:Begin/:Cap`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadDistinctList);
				pRestServer.get(`${tmpEndpointPrefix}s/Distinct/:Columns/:Begin/:Cap`, _EndpointAuthenticators.Reads, wireState, _Endpoints.ReadDistinctList);
				pRestServer.get(`${tmpEndpointPrefix}s/:Begin/:Cap`, _EndpointAuthenticators.Reads, wireState, _Endpoints.Reads);
			}
			if (_EnabledBehaviors.Update)
			{
				pRestServer.put(`${tmpEndpointPrefix}`, _CommonServices.bodyParser(), _EndpointAuthenticators.Update, wireState, _Endpoints.Update);
				pRestServer.put(`${tmpEndpointPrefix}s`, _CommonServices.bodyParser(), _EndpointAuthenticators.Update, wireState, _Endpoints.Updates);
				pRestServer.put(`${tmpEndpointPrefix}/Upsert`, _CommonServices.bodyParser(), _EndpointAuthenticators.Update, wireState, _Endpoints.Upsert);
				pRestServer.put(`${tmpEndpointPrefix}/Upserts`, _CommonServices.bodyParser(), _EndpointAuthenticators.Update, wireState, _Endpoints.Upserts);
			}
			if (_EnabledBehaviors.Delete)
			{
				pRestServer.del(`${tmpEndpointPrefix}`, _CommonServices.bodyParser(), _EndpointAuthenticators.Delete, wireState, _Endpoints.Delete);
				pRestServer.del(`${tmpEndpointPrefix}/:IDRecord`, _EndpointAuthenticators.Delete, wireState, _Endpoints.Delete);
			}
			if (_EnabledBehaviors.Count)
			{
				pRestServer.get(`${tmpEndpointPrefix}s/Count`, _EndpointAuthenticators.Count, wireState, _Endpoints.Count);
				pRestServer.get(`${tmpEndpointPrefix}s/Count/By/:ByField/:ByValue`, _EndpointAuthenticators.Count, wireState, _Endpoints.CountBy);
				pRestServer.get(`${tmpEndpointPrefix}s/Count/FilteredTo/:Filter`, _EndpointAuthenticators.Count, wireState, _Endpoints.Count);
			}
		};


		/**
		* Emulate a response object
		*/
		var wireResponse = function(pResponse, fCallback)
		{
			pResponse.send = function(data)
			{
				this.body = data;

				if (!data.Error)
				{
					if (data.constructor === Array)
					{
						this.Records = data;
					}
					else
					{
						this.Record = data;
					}
				}
			};

			Object.defineProperty(pResponse, 'text',
			{
				get: function() { return JSON.stringify(pResponse.body); },
				enumerable: true
			});

			return fCallback();
		};

		var _InvokeSetupCallback;
		var getInvokeSetupCallback = function()
		{
			return _InvokeSetupCallback;
		};

		var setInvokeSetupCallback = function(fCallback)
		{
			_InvokeSetupCallback = fCallback;
		};

		/**
		* Invoke a meadow endpoint programmatically
		*
		* @method invokeEndpoint
		*/
		var invokeEndpoint = function(pMethod, pData, pOptions, fCallback)
		{
			var tmpCallback = (typeof(pOptions) === 'function') ? pOptions : fCallback;

			if (!_Endpoints[pMethod])
			{
				_CommonServices.log.error('Endpoint \'' + pMethod + '\' does not exist!');
				return tmpCallback('Endpoint \'' + pMethod + '\' does not exist!'); //might be better as an exception
			}

			// TODO: should switch depending on type
			// TODO: should we keep this around, just make a deep copy of 'pOptions'
			var pRequest = {params: pData, formattedParams: pData, body: pData};
			if (typeof(pOptions) === 'object' && typeof(pOptions.header) === 'function') {
				// carry over header function
				pRequest.header = pOptions.header.bind(pOptions);
			}
			var pResponse = {};

			libAsync.waterfall([
				function(fStageComplete)
				{
					return wireResponse(pResponse, fStageComplete);
				},
				function(fStageComplete)
				{
					//allow consumer to specify user session data
					if (pOptions.UserSession)
					{
						//make a copy of the UserSession
						pRequest.UserSession = JSON.parse(JSON.stringify(pOptions.UserSession));
					}
					else
					{
						//else fill in default user session data
						pRequest.EndpointInvoked = true; //bypass session auth check
						pRequest.UserSession = { UserID: 0, UserRoleIndex: 0 };
					}

					// The Satchel is a workaround to pass state between query invocation and query decoration
					// Unfortunately, it has other uses, so we can't safely remove it here; this creates a risk of
					// cross-request state contamination (which we have seen cause issues).
					//FIXME: We should rework invokeEndpoint to make this state management unnecessary
					pRequest.Satchel = pOptions.Satchel;
					//internal invoke mark as authenticated (because this is not called via webservice)
					pRequest.EndpointAuthenticated = true;

					if (_InvokeSetupCallback && typeof(_InvokeSetupCallback) == 'function')
					{
						_InvokeSetupCallback(pRequest, pResponse, typeof(pOptions) === 'object' && pOptions);
					}
					return fStageComplete();
				},
				function(fStageComplete)
				{
					return wireCommonServices(pRequest, pResponse, fStageComplete);
				},
				function(fStageComplete)
				{
					return wireState(pRequest, pResponse, fStageComplete);
				},
				function(fStageComplete)
				{
					//Invoke the endpoint method
					_Endpoints[pMethod](pRequest, pResponse, function(err)
						{
							return fStageComplete(err, pResponse);
						});
				}
			],
			function complete(err)
			{
				return tmpCallback(err, pResponse);
			});
		};


		/**
		* Container Object for our Factory Pattern
		*/
		var tmpNewMeadowEndpointObject = (
		{
			setEndpoint: setEndpoint,
			setEndpointAuthenticator: setEndpointAuthenticator,
			setEndpointAuthorization: setEndpointAuthorization,

			wireState: wireState,

			connectRoutes: connectRoutes,

			parseFilter: require('meadow-filter').parse,

			// Expose the DAL
			DAL: _Meadow,

			getInvokeSetupCallback: getInvokeSetupCallback,
			setInvokeSetupCallback: setInvokeSetupCallback,
			invokeEndpoint: invokeEndpoint,

			// Factory
			new: createNew
		});

		/**
		 * Endpoint Authorization Levels
		 *
		 * @property endpointAuthorizationLevels
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowEndpointObject, 'endpointAuthorizationLevels',
			{
				get: function() { return _EndpointAuthorizationLevels; },
				enumerable: true
			});

		/**
		 * Endpoints
		 *
		 * @property endpoints
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowEndpointObject, 'endpoints',
			{
				get: function() { return _Endpoints; },
				enumerable: true
			});

		/**
		 * EndpointAuthenticators
		 *
		 * @property endpointAuthorizers
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowEndpointObject, 'endpointAuthorizers',
			{
				get: function() { return _Authorizers; },
				enumerable: true
			});

		/**
		 * EndpointAuthenticators
		 *
		 * @property endpointAuthenticators
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowEndpointObject, 'endpointAuthenticators',
			{
				get: function() { return _EndpointAuthenticators; },
				enumerable: true
			});

		/**
		 * EnabledBehaviors
		 *
		 * @property enabledBehaviors
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowEndpointObject, 'enabledBehaviors',
			{
				get: function() { return _EnabledBehaviors; },
				enumerable: true
			});

		/**
		 * Behavior Modifications
		 *
		 * @property behaviorModifications
		 * @type object
		 */
		Object.defineProperty(tmpNewMeadowEndpointObject, 'behaviorModifications',
			{
				get: function() { return _BehaviorModifications; },
				enumerable: true
			});

		return tmpNewMeadowEndpointObject;
	}

	return createNew();
};

module.exports = new MeadowEndpoints();
