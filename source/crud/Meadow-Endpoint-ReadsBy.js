/**
* Meadow Endpoint - Read a Record
*
* @license MIT
*
* @author Steven Velozo <steven@velozo.com>
* @module Meadow
*/
var libAsync = require('async');
const streamRecordsToResponse = require('./Meadow-StreamRecordArray');

/**
* Get a specific record from a DAL.
*/
var doAPIReadsByEndpoint = function(pRequest, pResponse, fNext)
{
	// This state is the requirement for the UserRoleIndex value in the UserSession object... processed by default as >=
	// The default here is that any authenticated user can use this endpoint.
	pRequest.EndpointAuthorizationRequirement = pRequest.EndpointAuthorizationLevels.Reads;

	// INJECT: Pre authorization (for instance to change the authorization level)

	if (pRequest.CommonServices.authorizeEndpoint(pRequest, pResponse, fNext) === false)
	{
		// If this endpoint fails, it's sent an error automatically.
		return;
	}

	// INJECT: Pre endpoint operation

	libAsync.waterfall(
		[
			// 1. Construct the Query
			function (fStageComplete)
			{
				pRequest.Query = pRequest.DAL.query;

				var tmpCap = false;
				var tmpBegin = false;
				if (typeof(pRequest.params.Begin) === 'string' ||
					typeof(pRequest.params.Begin) === 'number')
				{
					tmpBegin = parseInt(pRequest.params.Begin);
					if (isNaN(tmpBegin))
					{
						pRequest.CommonServices.log.warn('Ignoring non-numeric Begin parameter ['+pRequest.params.Begin+'].', {RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-ReadsBy'}, pRequest);
						tmpBegin = false;
					}
				}
				if (typeof(pRequest.params.Cap) === 'string' ||
					typeof(pRequest.params.Cap) === 'number')
				{
					tmpCap = parseInt(pRequest.params.Cap);
				}
				else
				{
					//maximum number of records to return by default on Read queries. Override via "MeadowDefaultMaxCap" fable setting.
					tmpCap = pRequest.DEFAULT_MAX_CAP;
				}
				if (isNaN(tmpCap))
				{
					pRequest.CommonServices.log.warn('Ignoring non-numeric Cap parameter ['+pRequest.params.Cap+']; falling back to the default maximum cap.', {RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-ReadsBy'}, pRequest);
					tmpCap = pRequest.DEFAULT_MAX_CAP;
				}
				pRequest.Query.setCap(tmpCap).setBegin(tmpBegin);

				fStageComplete(false);
			},
			// 2. Set the query up with the By Value/Field combo
			function (fStageComplete)
			{
				function addField(pByField, pByValue)
				{
					// TODO: Validate theat the ByField exists in the current database
					if (pByValue.constructor === Array)
					{
						pRequest.Query.addFilter(pByField, pByValue, 'IN', 'AND', 'RequestByField');
					}
					else
					{
						// We use a custon name for this (RequestDefaultIdentifier) in case there is a query with a dot in the default identifier.
						pRequest.Query.addFilter(pByField, pByValue, '=', 'AND', 'RequestByField');
					}
				}

				var tmpFilters = pRequest.params.Filters;
				if (tmpFilters &&
					tmpFilters.constructor === Array)
				{
					tmpFilters.forEach(function(filter)
					{
						addField(filter.ByField, filter.ByValue);
					});
				}
				else
				{
					addField(pRequest.params.ByField, pRequest.formattedParams.ByValue);
				}

				fStageComplete(false);
			},
			// 3. INJECT: Query configuration
			function (fStageComplete)
			{
				pRequest.BehaviorModifications.runBehavior('Reads-QueryConfiguration', pRequest, fStageComplete);
			},
			// 3b. INJECT: Query pre-authorization behavior (ex. if authorizer needs fields to be included, it can add them)
			function (fStageComplete)
			{
				pRequest.BehaviorModifications.runBehavior('Reads-PreAuth', pRequest, fStageComplete);
			},
			// 4. Execute the query
			function (fStageComplete)
			{
				pRequest.DAL.doReads(pRequest.Query, fStageComplete);
			},
			// 5. Post processing of the records
			function (pQuery, pRecords, fStageComplete)
			{
				if (!pRecords)
				{
					pRequest.CommonServices.log.info('Records not found', {SessionID:pRequest.UserSession.SessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-ReadsBy'}, pRequest);
					return pResponse.send([]);
				}
				pRequest.Records = pRecords;
				fStageComplete(false);
			},
			// 5.5: Check if there is an authorizer set for this endpoint and user role combination, and authorize based on that
			function (fStageComplete)
			{
				pRequest.Authorizers.authorizeRequest('ReadsBy', pRequest, fStageComplete);
			},
			// 6. INJECT: Post process the record, tacking on or altering anything we want to.
			function (fStageComplete)
			{
				pRequest.BehaviorModifications.runBehavior('Reads-PostOperation', pRequest, fStageComplete);
			},
			// 6.5: Check if authorization or post processing denied security access to the record
			function (fStageComplete)
			{
				if (pRequest.MeadowAuthorization)
				{
					// This will complete the waterfall operation
					return fStageComplete(false);
				}

				// It looks like this record was not authorized.  Send an error.
				return fStageComplete({Code:405,Message:'UNAUTHORIZED ACCESS IS NOT ALLOWED'});
			}
		],
		// 7. Return the results to the user
		function(pError)
		{
			if (pError)
			{
				return pRequest.CommonServices.sendCodedError('Error retreiving records by value.', pError, pRequest, pResponse, fNext);
			}

			pRequest.CommonServices.log.info('Read a list of records by '+pRequest.params.ByField+' = '+pRequest.params.ByValue+'.', {SessionID:pRequest.UserSession.SessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-ReadsBy'}, pRequest);
			return streamRecordsToResponse(pResponse, pRequest.Records, fNext);
		}
	);
};

module.exports = doAPIReadsByEndpoint;
