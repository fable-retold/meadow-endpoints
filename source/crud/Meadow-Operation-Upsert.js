/**
* Meadow Operation - Upsert a record
*
* @license MIT
*
* @author Steven Velozo <steven@velozo.com>
* @module Meadow
*/
/**
* Upsert a record using the Meadow DAL object.
*/

var libAsync = require('async');

var doCreate = require('./Meadow-Operation-Create.js');
var doUpdate = require('./Meadow-Operation-Update.js');
const util = require("util");

var doUpsert = function(pRecordToUpsert, pRequest, pResponse, fCallback)
{
	pRequest.MeadowOperation = (typeof(pRequest.MeadowOperation) === 'string') ? pRequest.MeadowOperation : 'Upsert';

	libAsync.waterfall(
		[
			function(fStageComplete)
			{
				// Prepare to gather requirements for upserting
				pRequest.Record = pRecordToUpsert;

				var tmpQuery = pRequest.DAL.query;

				// This operation will be create only if there is no GUID or ID in the record bundle
				pRequest.UpsertCreateOnly = true;

				// See if there is a default identifier or default GUIdentifier.
				// The GUIdentifier is checked for `string` rather than merely
				// `!== undefined`: a null passes that guard and the `.length`
				// read below then throws out of the waterfall, which fails the
				// whole request (and, on a bulk upsert, every record after it).
				// Serializers that emit each schema column produce
				// { GUID<Entity>: null } routinely.
				if ((typeof(pRecordToUpsert[pRequest.DAL.defaultGUIdentifier]) === 'string') && pRecordToUpsert[pRequest.DAL.defaultGUIdentifier].length > 0)
				{
					tmpQuery.addFilter(pRequest.DAL.defaultGUIdentifier, pRecordToUpsert[pRequest.DAL.defaultGUIdentifier]);
					pRequest.UpsertCreateOnly = false;
				}
				if ((typeof(pRecordToUpsert[pRequest.DAL.defaultIdentifier]) !== 'undefined') && (pRecordToUpsert[pRequest.DAL.defaultIdentifier] > 0))
				{
					tmpQuery.addFilter(pRequest.DAL.defaultIdentifier, pRecordToUpsert[pRequest.DAL.defaultIdentifier]);
					pRequest.UpsertCreateOnly = false;
				}

				if (pRequest.UpsertCreateOnly)
				{
					// Just create the record
					doCreate(pRecordToUpsert, pRequest, pResponse, fStageComplete);
				}
				else
				{
					// Load the record to see if it exists
					pRequest.DAL.doRead(tmpQuery,
						function(pError, pQuery, pRecord)
						{
							if (pError)
							{
								// Return the error, because there was an error.
								return fStageComplete(pError);
							}
							else if (!pError && !pRecord)
							{
								// Record not found -- do a create.
								doCreate(pRecordToUpsert, pRequest, pResponse, fStageComplete);
							}
							else
							{
								// Set the default ID in the passed-in record if it doesn't exist..
								if (!pRecordToUpsert.hasOwnProperty(pRequest.DAL.defaultIdentifier))
								{
									pRecordToUpsert[pRequest.DAL.defaultIdentifier] = pRecord[pRequest.DAL.defaultIdentifier];
								}
								// If the found record does not match the passed ID --- what the heck?!
								if (pRecordToUpsert[pRequest.DAL.defaultIdentifier] != pRecord[pRequest.DAL.defaultIdentifier])
								{
									return fStageComplete('Default identifier does not match GUID record.');
								}
								// Record found -- do an update.  Use the cached record, though.
								doUpdate(pRecordToUpsert, pRequest, pResponse, fStageComplete, pRecord);
							}
						});
				}
			},
			function(fStageComplete)
			{
				// Now stuff the record into the upserted array
				pRequest.UpsertedRecords.push(pRequest.Record);
				fStageComplete(null);
			}
		], function(pError)
		{
			if (pError)
			{
				let errorMessage;
				// attempt to unwrap the error
				if (pError instanceof Error) {
					errorMessage = pError.message;
				} else if (pError && pError.Message) {
					errorMessage = pError.Message;
				} else {
					errorMessage = pError;
				}

				pRecordToUpsert.Error = 'Error upserting record: '+errorMessage;
				pRequest.RecordUpsertError = true;
				pRequest.RecordUpsertErrorMessage = pError;
				pRequest.UpsertedRecords.push(pRecordToUpsert);
				// use nodejs util to pretty print our error message
				const prettyPrintedError = util.inspect(pError, {
					maxArrayLength: 10,
					compact: true,
					showHidden: true,
					depth: 3,
					maxStringLength: 200,
				});
				pRequest.CommonServices.log.error('Error upserting record: '+prettyPrintedError, {SessionID:pRequest.UserSession.SessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-'+pRequest.MeadowOperation, Stack: pError.stack }, pRequest);
			}

			return fCallback();
		});
};

module.exports = doUpsert;
