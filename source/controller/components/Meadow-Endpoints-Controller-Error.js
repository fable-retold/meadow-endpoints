/**
 * Error object extended with the extra response-shape metadata
 * meadow-endpoints attaches: an HTTP StatusCode and a flag telling
 * the error handler whether to include a stack trace in the response.
 *
 * @typedef {Error & { StatusCode?: number, SuppressSoftwareTrace?: boolean, code?: string }} MeadowEndpointError
 */

class MeadowEndpointsControllerErrorBase
{
	/**
	 * @param {import('../Meadow-Endpoints-Controller-Base.js')} pController
	 */
	constructor(pController)
	{
		this._Controller = pController;
	}

	// Get the error object
	getError(pMessage, pStatusCode, pSuppressSoftwareTrace)
	{
		const tmpError = /** @type {MeadowEndpointError} */ (new Error(pMessage));

		// Default the error status code to 400 if none is passed
		tmpError.StatusCode = (typeof(pStatusCode) == 'number') ? pStatusCode : 400;
		// This suppresses the stack trace from being sent back or logged.
		// And by default it does not send a stack trace, as we expect errors created this way to be protocol, schema or data related.
		tmpError.SuppressSoftwareTrace = (typeof(pSuppressSoftwareTrace) != 'undefined') ? pSuppressSoftwareTrace : true;

		return tmpError;
	}

	/**
	 * Coerce anything that arrives on an error path into a MeadowEndpointError.
	 *
	 * The behavior injection contract (see Meadow-Endpoints-Controller-BehaviorInjection.js)
	 * lets a handler signal failure with a string, and endpoints may still complete a
	 * waterfall with a legacy {Code, Message} object. Neither carries a `message`, so
	 * without this the response body and the log line both end up empty.
	 *
	 * @param {*} pError - the error to coerce, of any shape
	 * @return {MeadowEndpointError} the error as a MeadowEndpointError
	 */
	normalizeError(pError)
	{
		if (pError instanceof Error)
		{
			const tmpNativeError = /** @type {MeadowEndpointError} */ (pError);

			// Filled in place rather than rebuilt so the original stack survives.
			if ((typeof(tmpNativeError.message) !== 'string') || (tmpNativeError.message.length < 1))
			{
				tmpNativeError.message = `Unknown ${tmpNativeError.name || 'Error'}.`;
			}

			return tmpNativeError;
		}

		if (typeof(pError) === 'string')
		{
			return this.getError(pError, 500);
		}

		if ((typeof(pError) === 'object') && (pError !== null))
		{
			// Legacy {Code, Message} errors carry an HTTP status in Code; anything else
			// (a driver error code such as ER_BAD_FIELD_ERROR) is not a status code.
			const tmpStatusCode = (typeof(pError.StatusCode) === 'number') ? pError.StatusCode
				: ((typeof(pError.Code) === 'number') && (pError.Code >= 100) && (pError.Code <= 599)) ? pError.Code
				: 500;

			const tmpMessage = ((typeof(pError.Message) === 'string') && (pError.Message.length > 0)) ? pError.Message
				: ((typeof(pError.message) === 'string') && (pError.message.length > 0)) ? pError.message
				: this.describeError(pError);

			const tmpError = this.getError(tmpMessage, tmpStatusCode, pError.SuppressSoftwareTrace);

			if ((typeof(pError.code) === 'string') || (typeof(pError.code) === 'number'))
			{
				tmpError.code = String(pError.code);
			}

			return tmpError;
		}

		return this.getError(this.describeError(pError), 500);
	}

	/**
	 * Flatten an error into a message string, for the in-band per-record failure markers
	 * the bulk endpoints attach to a returned record.
	 *
	 * A raw Error cannot be used there: `message` is not an enumerable own property, so
	 * JSON.stringify drops it and the marker reaches the client with no message at all.
	 *
	 * @param {*} pError - the error to flatten, of any shape
	 * @return {string} the error message
	 */
	getErrorMessage(pError)
	{
		return this.normalizeError(pError).message;
	}

	/**
	 * Describe an error value that carries no message of its own, so its payload still
	 * reaches the log and the client rather than being flattened to [object Object].
	 *
	 * @param {*} pError - the error value to describe
	 * @return {string} a serialized description of the error
	 */
	describeError(pError)
	{
		try
		{
			const tmpSerializedError = JSON.stringify(pError);

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
		// null-prototype and Symbol.toPrimitive-hostile values, which would otherwise
		// throw from inside the error handler itself.
		return Object.prototype.toString.call(pError);
	}

	// Handle an error if set -- some errors don't send the response back because they aren't fully errory errors.
	handleErrorIfSet(pRequest, pRequestState, pResponse, pError, fCallback)
	{
		if (pError)
		{
			return this.sendError(pRequest, pRequestState, pResponse, pError, fCallback);
		}

		return fCallback();
	}

	// Send an error object
	sendError(pRequest, pRequestState, pResponse, pError, fCallback)
	{
		const tmpError = this.normalizeError(pError);

		this._Controller.log.logRequestError(pRequest, pRequestState, tmpError);

		// TODO: Detect if we've already sent headers?
		if (!this._Controller.ControllerOptions.SendErrorStatusCodes)
		{
			let tmpStatusCode = (typeof(tmpError.StatusCode) === 'number') ? tmpError.StatusCode : 500;
			pResponse.status(tmpStatusCode);
		}

		let tmpResponseObject = (
			{
				Error:tmpError.message,
				StatusCode:tmpError.StatusCode
			});

		tmpResponseObject = this._Controller.ErrorHandler.prepareRequestContextOutputObject(tmpResponseObject, pRequest, pRequestState, tmpError);

		pResponse.send(tmpResponseObject);

		fCallback(tmpError);
	}

	// This looks for some generic markers in the request state and puts them into a log or send object
	prepareRequestContextOutputObject(pObjectToPopulate, pRequest, pRequestState, pError)
	{
		// Internally created errors supress stack traces
		if (pError)
		{
			pObjectToPopulate.Error = pError.message;
			pObjectToPopulate.Code = pError.code;
			pObjectToPopulate.StatusCode = pError.StatusCode;

			if (!pError.SuppressSoftwareTrace)
			{
				pObjectToPopulate.Stack = pError.stack;
			}

			if (pRequestState.hasOwnProperty('Record'))
			{
				pObjectToPopulate.Record = pRequestState.Record;
			}

			if (pRequestState.hasOwnProperty('Query') && (typeof(pRequestState.Query) == 'object'))
			{
				if (pRequestState.Query.query)
				{
					if (typeof(pRequestState.Query.query.body) == 'string')
					{
						pObjectToPopulate.Query = pRequestState.Query.query.body;
					}

					if ((typeof(pRequestState.Query.query.parameters) == 'object'))
					{
						pObjectToPopulate.QueryParameters = pRequestState.Query.query.parameters;

						pObjectToPopulate.RebuiltQueryString = (typeof(pObjectToPopulate.Query) == 'string') ? pObjectToPopulate.Query : '';

						// This gnarly bit of code attempts to reconstruct a non prepared string version of the query, to help.
						let tmpQueryParameterSet = Object.keys(pObjectToPopulate.QueryParameters);
						for (let i = 0; i < tmpQueryParameterSet.length; i++)
						{
							switch(typeof(tmpQueryParameterSet[i]))
							{
								case 'number':
									pObjectToPopulate.RebuiltQueryString  = pObjectToPopulate.RebuiltQueryString.replace(new RegExp(`:${tmpQueryParameterSet[i]}\\b`, 'g'), `'${pObjectToPopulate.QueryParameters[tmpQueryParameterSet[i]]}'`);
									break;
								case 'string':
									// TODO: This may need more ... nuance...
									default:
									pObjectToPopulate.RebuiltQueryString  = pObjectToPopulate.RebuiltQueryString.replace(new RegExp(`:${tmpQueryParameterSet[i]}\\b`,'g'), pObjectToPopulate.QueryParameters[tmpQueryParameterSet[i]]);
									break;
							}
						}
					}
				}
			}
		}

		return pObjectToPopulate;
	}
}

module.exports = MeadowEndpointsControllerErrorBase;
