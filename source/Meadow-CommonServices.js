/**
* The Meadow Common Services Provider
*
* This class aims to provide anything that every request will need.
*
* @class MeadowCommonServices
* @constructor
*/
var MeadowCommonServices = function()
{
	function createNew(pMeadow)
	{
		// If a valid fable object isn't passed in, return a constructor
		if ((typeof(pMeadow) !== 'object') || !('fable' in pMeadow))
		{
			return {new: createNew};
		}

		var _Meadow = pMeadow;
		var _Log = _Meadow.fable.log;

		var libRestify = require('restify');

		/**
		 * Describe an error object that carries no message of its own, so its payload still
		 * reaches the log and the client rather than being flattened to [object Object].
		 *
		 * @method describeUnknownError
		 * @param {Object} pError - the error object to describe
		 * @return {string} a serialized description of the error
		 */
		var describeUnknownError = function(pError)
		{
			try
			{
				var tmpSerializedError = JSON.stringify(pError);

				if ((typeof(tmpSerializedError) === 'string') && (tmpSerializedError !== '{}'))
				{
					return (tmpSerializedError.length > 512) ? tmpSerializedError.substring(0, 512) : tmpSerializedError;
				}
			}
			catch (pSerializationError)
			{
				// Fall through to the tag-based description below.
			}

			// Object.prototype.toString is used rather than String() because it is safe for
			// null-prototype and Symbol.toPrimitive-hostile objects, which would otherwise
			// throw from within the error handler itself.
			return Object.prototype.toString.call(pError);
		};


		/**
		 * Resolve an error of any shape into a human-readable message and a numeric error code.
		 *
		 * Internally generated errors are plain objects shaped {Code, Message}; errors bubbled up
		 * from meadow and the underlying database driver are native Errors shaped {code, message}
		 * (where `code` is a driver string such as ER_BAD_FIELD_ERROR, not a numeric API code).
		 *
		 * @method resolveError
		 * @param {string} pDefaultMessage - the message to use when the error carries none
		 * @param {*} pError - the error to resolve, of any shape
		 * @return {{Message: string, Code: number, SourceCode: (string|number|null), Stack: (string|null)}} the resolved error
		 */
		var resolveError = function(pDefaultMessage, pError)
		{
			var tmpResolvedError = (
			{
				Message: (typeof(pDefaultMessage) === 'string') ? pDefaultMessage : 'Unknown API error.',
				Code: 1,
				SourceCode: null,
				Stack: null
			});

			if ((typeof(pError) === 'object') && (pError !== null))
			{
				if ((typeof(pError.Message) === 'string') && (pError.Message.length > 0))
				{
					tmpResolvedError.Message = pError.Message;
				}
				else if ((typeof(pError.message) === 'string') && (pError.message.length > 0))
				{
					tmpResolvedError.Message = tmpResolvedError.Message + ' ' + pError.message;
				}
				else
				{
					tmpResolvedError.Message = tmpResolvedError.Message + ' ' + describeUnknownError(pError);
				}

				if (typeof(pError.Code) === 'number')
				{
					tmpResolvedError.Code = pError.Code;
				}

				if ((typeof(pError.code) === 'string') || (typeof(pError.code) === 'number'))
				{
					tmpResolvedError.SourceCode = pError.code;
				}
				else if (typeof(pError.errno) === 'number')
				{
					tmpResolvedError.SourceCode = pError.errno;
				}

				if (typeof(pError.stack) === 'string')
				{
					tmpResolvedError.Stack = pError.stack;
				}
			}
			else if ((typeof(pError) !== 'undefined') && (pError !== null) && (pError !== false))
			{
				tmpResolvedError.Message = tmpResolvedError.Message + ' ' + String(pError);
			}

			if (tmpResolvedError.SourceCode !== null)
			{
				tmpResolvedError.Message = tmpResolvedError.Message + ' [' + tmpResolvedError.SourceCode + ']';
			}

			return tmpResolvedError;
		};


		/**
		 * Send an Error Code and Error Message to the client, and log it as an error in the log files.
		 *
		 * @method sendCodedError
		 */
		var sendCodedError = function(pDefaultMessage, pError, pRequest, pResponse, fNext)
		{
			var tmpResolvedError = resolveError(pDefaultMessage, pError);
			var tmpScope = null;
			var tmpParams = null;
			var tmpSessionID = null;

			if (pRequest.DAL)
			{
				tmpScope = pRequest.DAL.scope;
			}
			if (pRequest.params)
			{
				tmpParams = pRequest.params;
			}
			if (pRequest.UserSession)
			{
				tmpSessionID = pRequest.UserSession.SessionID;
			}

			_Log.warn('API Error: '+tmpResolvedError.Message, {SessionID: tmpSessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Scope: tmpScope, Parameters: tmpParams, Action:'APIError', ErrorCode: tmpResolvedError.Code, ErrorSourceCode: tmpResolvedError.SourceCode, Stack: tmpResolvedError.Stack}, pRequest);
			pResponse.send({Error:tmpResolvedError.Message, ErrorCode: tmpResolvedError.Code});

			return fNext();
		};


		/**
		 * Send an Error to the client, and log it as an error in the log files.
		 *
		 * @method sendError
		 */
		var sendError = function(pMessage, pRequest, pResponse, fNext)
		{
			var tmpSessionID = null;
			if (pRequest.UserSession)
			{
				tmpSessionID = pRequest.UserSession.SessionID;
			}

			_Log.warn('API Error: '+pMessage, {SessionID: tmpSessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:'APIError'}, pRequest);
			pResponse.send({Error:pMessage});

			return fNext();
		};


		/**
		 * Check that the user has an appropriate user level to use the current endpoint
		 *
		 * @method authorizeEndpoint
		 */
		var authorizeEndpoint = function(pRequest, pResponse, fNext)
		{
			if (!pRequest.EndpointAuthenticated)
			{
				pRequest.CommonServices.log.warn('Unauthenticated user attempting to get a secured resource.', {RequestID:pRequest.RequestUUID}, pRequest);
				sendNotAuthorized('You must be authenticated to access this resource.', pRequest, pResponse, fNext);
				return false;
			}

			//Check if endpoint is being invoked programmatically, in which case
			// we bypass session authentication checks
			if (pRequest.EndpointInvoked)
			{
				return true;
			}

			// Check that the user has a valid ID.
			var tmpIDUser = pRequest.UserSession.UserID;
			if (tmpIDUser < 1)
			{
				_Log.warn('Invalid session when attempting to get a secured resource - IDUser is not valid.', {SessionID:pRequest.UserSession.SessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:'APISecurity'}, pRequest);
				sendNotAuthorized('You must be authenticated to access this resource.', pRequest, pResponse, fNext);
				return false;
			}

			// Check that the authentication level is valid.
			if (pRequest.UserSession.UserRoleIndex < pRequest.EndpointAuthorizationRequirement)
			{
				_Log.warn('Invalid permission level when attempting to get a secured resource.', {SessionID:pRequest.UserSession.SessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:'APISecurity', RequiredUserLevel:pRequest.EndpointAuthorizationRequirement, 				ActualUserLevel:pRequest.UserSession.UserRoleIndex}, pRequest);
				// TODO: Send the proper http status code
				sendNotAuthorized('You must be appropriately authenticated to access this resource.', pRequest, pResponse, fNext);
				return false;
			}

			return true;
		};


		/**
		 * Send a not authorized response to the client, and log it in the log files.
		 *
		 * @method sendNotAuthorized
		 */
		var sendNotAuthorized = function(pMessage, pRequest, pResponse, fNext)
		{
			// TODO: Use the proper http code
			_Log.trace('API Unauthorized Attempt: '+pMessage, {SessionID:pRequest.UserSession.SessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:'APIUnauthorized'}, pRequest);

			//cause a delay to mitigate DoS type attacks against endpoints
			setTimeout(function()
			{
				pResponse.send({Error:pMessage});

				return fNext();
			}, (_Meadow.fable.settings.UnauthorizedRequestDelay ? _Meadow.fable.settings.UnauthorizedRequestDelay : 15000));
		};


		/**
		* Container Object for our Factory Pattern
		*/
		var tmpNewMeadowCommonServices = (
		{
			authorizeEndpoint: authorizeEndpoint,

			resolveError: resolveError,
			sendCodedError: sendCodedError,
			sendError: sendError,
			sendNotAuthorized: sendNotAuthorized,

			// Restify body parser passed through, for any POST and PUT requests
			bodyParser: libRestify.plugins.bodyParser,

			new: createNew
		});

		// Turn the common services object into a first-class Fable object
		// addServices removed in fable 2.x
		if (typeof(_Meadow.fable.addServices) === 'function')
		{
			_Meadow.fable.addServices(tmpNewMeadowCommonServices);
		}
		else
		{
			// bring over addServices implementation from Fable 1.x for backward compatibility
			Object.defineProperty(tmpNewMeadowCommonServices, 'fable',
			{
				get: function() { return _Meadow.fable; },
				enumerable: false,
			});

			Object.defineProperty(tmpNewMeadowCommonServices, 'settings',
			{
				get: function() { return _Meadow.fable.settings; },
				enumerable: false,
			});

			Object.defineProperty(tmpNewMeadowCommonServices, 'log',
			{
				get: function() { return _Meadow.fable.log; },
				enumerable: false,
			});
		}

		return tmpNewMeadowCommonServices;
	}

	return createNew();
};

module.exports = new MeadowCommonServices();
