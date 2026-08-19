/**
* Meadow Endpoint - Undelete a Record
*
* @license MIT
*
* @author Steven Velozo <steven@velozo.com>
* @module Meadow
*/
/**
* Undelete a record using the Meadow DAL object
*/

var libAsync = require('async');


var doAPIUndeleteEndpoint = function(pRequest, pResponse, fNext)
{
	// This state is the requirement for the UserRoleIndex value in the UserSession object... processed by default as >=
	// Undelete inherits the Delete requirement unless the consumer has explicitly set one for Undelete.
	pRequest.EndpointAuthorizationRequirement = pRequest.EndpointAuthorizationLevels.hasOwnProperty('Undelete') ?
		pRequest.EndpointAuthorizationLevels.Undelete : pRequest.EndpointAuthorizationLevels.Delete;

	// INJECT: Pre authorization (for instance to change the authorization level)

	if (pRequest.CommonServices.authorizeEndpoint(pRequest, pResponse, fNext) === false)
	{
		// If this endpoint fails, it's sent an error automatically.
		return;
	}

	// INJECT: Pre endpoint operation

	var tmpIDRecord = 0;
	if (typeof(pRequest.params.IDRecord) === 'string')
	{
		tmpIDRecord = pRequest.params.IDRecord;
	}
	else if (pRequest.body && typeof(pRequest.body[pRequest.DAL.defaultIdentifier]) === 'number')
	{
		tmpIDRecord = pRequest.body[pRequest.DAL.defaultIdentifier];
	}
	else if (pRequest.body && typeof(pRequest.body[pRequest.DAL.defaultIdentifier]) === 'string')
	{
		tmpIDRecord = pRequest.body[pRequest.DAL.defaultIdentifier];
	}
	// Although the undelete request could allow multiple undeletes, we require an identifier.
	if (!parseInt(tmpIDRecord) || tmpIDRecord < 1)
	{
		return pRequest.CommonServices.sendError('Record undelete failure - a valid record ID is required in the passed-in record.', pRequest, pResponse, fNext);
	}

	var tmpRecordCount = {};
	var tmpQuery;
	var tmpDeletedColumn = false;

	libAsync.waterfall(
		[
			function(fStageComplete)
			{
				// Undelete only makes sense on a record set that tracks deletes with a bit
				var tmpSchema = pRequest.DAL.schema;
				for (var i = 0; i < tmpSchema.length; i++)
				{
					if (tmpSchema[i].Type === 'Deleted')
					{
						tmpDeletedColumn = tmpSchema[i].Column;
						break;
					}
				}

				if (!tmpDeletedColumn)
				{
					return fStageComplete({Code:500,Message:'No undelete bit on record.'});
				}

				return fStageComplete();
			},
			function(fStageComplete)
			{
				tmpQuery = pRequest.DAL.query;

				// INJECT: Query configuration and population

				// This is not overloadable.
				tmpQuery.addFilter(pRequest.DAL.defaultIdentifier, tmpIDRecord);
				// Filtering on the deleted bit explicitly also suppresses the automatic "not deleted" filter on the read below.
				tmpQuery.addFilter(tmpDeletedColumn, 1);
				tmpQuery.setIDUser(pRequest.UserSession.UserID);

				return fStageComplete();
			},
			function(fStageComplete)
			{
				// Load the record so we can do security checks on it
				pRequest.DAL.doRead(tmpQuery,
					function(pError, pQuery, pRecord)
					{
						if (!pRecord)
						{
							tmpRecordCount = {Count:0};
							return fStageComplete("NO_RECORD_FOUND");
						}

						pRequest.Record = pRecord;

						return fStageComplete();
					});
			},
			function(fStageComplete)
			{
				// Schemas which do not configure a dedicated Undelete authorizer are governed by their Delete authorizer.
				var tmpAuthorizerHash = pRequest.Authorizers.hasAuthorizerDefinition('Undelete', pRequest) ? 'Undelete' : 'Delete';

				pRequest.Authorizers.authorizeRequest(tmpAuthorizerHash, pRequest, fStageComplete);
			},
			function(fStageComplete)
			{
				// INJECT: Once we've checked the authorizer and are ready to Undelete, invoke an injected behavior before we execute the actual undelete operation
				return pRequest.BehaviorModifications.runBehavior('Undelete-PreOperation', pRequest, fStageComplete);
			},
			function(fStageComplete)
			{
				// INJECT: Record modification before undelete

				if (pRequest.MeadowAuthorization)
				{
					return fStageComplete(false);
				}

				// It looks like this record was not authorized.  Send an error.
				return fStageComplete({Code:405,Message:'UNAUTHORIZED ACCESS IS NOT ALLOWED'});
			},
			function(fStageComplete)
			{
				// Do the undelete
				pRequest.DAL.doUndelete(tmpQuery,
					function(pError, pQuery, pCount)
					{
						// It returns the number of rows undeleted
						tmpRecordCount = {Count:pCount};

						return fStageComplete(pError);
					});
			},
			function(fStageComplete)
			{
				// INJECT: After the undelete count is grabbed, let the user alter the response content
				return pRequest.BehaviorModifications.runBehavior('Undelete-PostOperation', pRequest, fStageComplete);
			}
		], function(pError)
		{
			if (pError &&
				pError !== "NO_RECORD_FOUND")
			{
				return pRequest.CommonServices.sendCodedError('Error undeleting a record.', pError, pRequest, pResponse, fNext);
			}

			pRequest.CommonServices.log.info('Undeleted '+tmpRecordCount.Count+' records with ID '+tmpIDRecord+'.', {SessionID:pRequest.UserSession.SessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-Undelete'}, pRequest);
			pResponse.send(tmpRecordCount);

			return fNext();
		}
	);
};

module.exports = doAPIUndeleteEndpoint;
