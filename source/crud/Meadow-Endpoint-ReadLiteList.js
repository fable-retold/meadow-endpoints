/**
* Meadow Endpoint - Read a list of lite Records (for Drop-downs and such)
*
* @license MIT
*
* @author Steven Velozo <steven@velozo.com>
* @module Meadow
*/
var libAsync = require('async');
const meadowFilterParser = require('meadow-filter').parse;
var marshalLiteList = require('./Meadow-Marshal-LiteList.js');
const streamRecordsToResponse = require('./Meadow-StreamRecordArray');

/**
* Get a set of records from a DAL.
*/
var doAPIReadLiteEndpoint = function(pRequest, pResponse, fNext)
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

	libAsync.waterfall(
		[
			// 1a. Get the records
			function (fStageComplete)
			{
				pRequest.Query = pRequest.DAL.query;
				// TODO: Limit the query to the columns we need for the templated expression

				var tmpCap = false;
				var tmpBegin = false;
				if (typeof(pRequest.params.Begin) === 'string' ||
					typeof(pRequest.params.Begin) === 'number')
				{
					tmpBegin = parseInt(pRequest.params.Begin, 10);
					if (isNaN(tmpBegin))
					{
						pRequest.CommonServices.log.warn('Ignoring non-numeric Begin parameter ['+pRequest.params.Begin+'].', {RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-ReadLite'}, pRequest);
						tmpBegin = false;
					}
				}
				if (typeof(pRequest.params.Cap) === 'string' ||
					typeof(pRequest.params.Cap) === 'number')
				{
					tmpCap = parseInt(pRequest.params.Cap, 10);
				}
				else
				{
					//maximum number of records to return by default on Read queries. Override via "MeadowDefaultMaxCap" fable setting.
					tmpCap = pRequest.DEFAULT_MAX_CAP;
				}
				if (isNaN(tmpCap))
				{
					pRequest.CommonServices.log.warn('Ignoring non-numeric Cap parameter ['+pRequest.params.Cap+']; falling back to the default maximum cap.', {RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-ReadLite'}, pRequest);
					tmpCap = pRequest.DEFAULT_MAX_CAP;
				}
				pRequest.Query.setCap(tmpCap).setBegin(tmpBegin);
				if (typeof(pRequest.params.Filter) === 'string')
				{
					// If a filter has been passed in, parse it and add the values to the query.
					meadowFilterParser(pRequest.params.Filter, pRequest.Query);
				}
				else if (pRequest.params.Filter)
				{
					pRequest.Query.setFilter(pRequest.params.Filter);
				}

				fStageComplete(false);
			},
			// 1b. INJECT: Query configuration
			function (fStageComplete)
			{
				pRequest.BehaviorModifications.runBehavior('Reads-QueryConfiguration', pRequest, fStageComplete);
			},
			// 1b2. INJECT: Query pre-authorization behavior (ex. if authorizer needs fields to be included, it can add them)
			function (fStageComplete)
			{
				pRequest.BehaviorModifications.runBehavior('Reads-PreAuth', pRequest, fStageComplete);
			},
			// 1c. Do the record read
			function (fStageComplete)
			{
				pRequest.DAL.doReads(pRequest.Query, fStageComplete);
			},
			// 2. Post processing of the records
			function (pQuery, pRecords, fStageComplete)
			{
				if (pRecords.length < 1)
				{
					pRecords = [];
				}

				pRequest.Records = pRecords;

				// Complete the waterfall operation
				fStageComplete(false);
			},
			// 2.5: Check if there is an authorizer set for this endpoint and user role combination, and authorize based on that
			function (fStageComplete)
			{
				// shared permission with reads
				pRequest.Authorizers.authorizeRequest('Reads', pRequest, fStageComplete);
			},
			// 2.6: Check if authorization or post processing denied security access to the record
			function (fStageComplete)
			{
				if (pRequest.MeadowAuthorization)
				{
					return fStageComplete(false);
				}

				// It looks like this record was not authorized.  Send an error.
				return fStageComplete({Code:405,Message:'UNAUTHORIZED ACCESS IS NOT ALLOWED'});
			},
			// 2.7: INJECT: Post-operation behavior (e.g. field cleansing)
			function (fStageComplete)
			{
				pRequest.BehaviorModifications.runBehavior('ReadsLite-PostOperation', pRequest, fStageComplete);
			},
			// 3. Marshalling of records into the hash list, using underscore templates.
			function (fStageComplete)
			{
				// Allow the endpoint to pass in extra columns.
				// Break it apart by comma separated list
				fStageComplete(false, marshalLiteList(pRequest.Records, pRequest, (typeof(pRequest.params.ExtraColumns) === 'string') ? pRequest.params.ExtraColumns.split(',') : []));
			}
		],
		// 3. Return the results to the user
		function(pError, pResultRecords)
		{
			// Remove 'Records' object from pRequest, instead return template results (pResultRecords) for the records
			delete pRequest['Records'];

			if (pError)
			{
				return pRequest.CommonServices.sendCodedError('Error retreiving a recordset.', pError, pRequest, pResponse, fNext);
			}

			pRequest.CommonServices.log.info('Read a recordset lite list with '+pResultRecords.length+' results.', {SessionID:pRequest.UserSession.SessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-ReadLite'}, pRequest);
			return streamRecordsToResponse(pResponse, pResultRecords, fNext);
		}
	);
};

module.exports = doAPIReadLiteEndpoint;
