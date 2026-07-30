/**
* Meadow Endpoint - Read a list of Records with a specified set of columns, distinct by those columns.
*
* @license MIT
*
* @author Alex Decker <alex.decker@headlight.com>
* @module Meadow
*/
const libAsync = require('async');
const meadowFilterParser = require('meadow-filter').parse;
const marshalDistinctList = require('./Meadow-Marshal-DistinctList.js');
const streamRecordsToResponse = require('./Meadow-StreamRecordArray');

/**
* Get a set of records from a DAL.
*/
const doAPIReadDistinctEndpoint = function(pRequest, pResponse, fNext)
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

	let tmpDistinctColumns;
	libAsync.waterfall(
		[
			// 1a. Get the records
			function (fStageComplete)
			{
				pRequest.Query = pRequest.DAL.query.setDistinct(true);
				// TODO: Limit the query to the columns we need for the templated expression

				let tmpCap = false;
				let tmpBegin = false;
				if (typeof(pRequest.params.Begin) === 'string' ||
					typeof(pRequest.params.Begin) === 'number')
				{
					tmpBegin = parseInt(pRequest.params.Begin, 10);
					if (isNaN(tmpBegin))
					{
						pRequest.CommonServices.log.warn('Ignoring non-numeric Begin parameter ['+pRequest.params.Begin+'].', {RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-ReadDistinct'}, pRequest);
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
					pRequest.CommonServices.log.warn('Ignoring non-numeric Cap parameter ['+pRequest.params.Cap+']; falling back to the default maximum cap.', {RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-ReadDistinct'}, pRequest);
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
				if (typeof(pRequest.params.Columns) === 'string')
				{
					tmpDistinctColumns = pRequest.params.Columns.split(',');
					if (!tmpDistinctColumns)
					{
						return fStageComplete({Code:400,Message:'Columns to distinct on must be provided.'});
					}
					pRequest.Query.setDataElements(tmpDistinctColumns);
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
			// 3. Marshalling of records into the hash list, using underscore templates.
			function (fStageComplete)
			{
				fStageComplete(false, marshalDistinctList(pRequest.Records, pRequest, tmpDistinctColumns));
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

			pRequest.CommonServices.log.info('Read a recordset lite list with '+pResultRecords.length+' results.', {SessionID:pRequest.UserSession.SessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-ReadDistinct'}, pRequest);
			return streamRecordsToResponse(pResponse, pResultRecords, fNext);
		}
	);
};

module.exports = doAPIReadDistinctEndpoint;
