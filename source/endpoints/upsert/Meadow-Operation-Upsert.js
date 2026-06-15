/**
* Meadow Operation - Upsert a record
*/
const doCreate = require('../create/Meadow-Operation-Create.js');
const doUpdate = require('../update/Meadow-Operation-Update.js');

const doUpsert = function(pRecordToUpsert, pRequest, pRequestState, pResponse, fCallback)
{
	let tmpRequestState = this.cloneAsyncSafeRequestState(pRequestState, 'Upsert');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	this.waterfall(
		[
			(fStageComplete) =>
			{
				tmpRequestState.Query = this.DAL.query;
				this.stampSessionOverrideOnQuery(tmpRequestState);

				// Prepare to gather requirements for upserting
				tmpRequestState.Record = pRecordToUpsert;

				// This operation will be create only if there is no GUID or ID in the record bundle
				tmpRequestState.UpsertCreateOnly = true;

				// See if there is a default identifier or default GUIdentifier
				if ((typeof(tmpRequestState.Record[this.DAL.defaultGUIdentifier]) !== 'undefined') && tmpRequestState.Record[this.DAL.defaultGUIdentifier].length > 0)
				{
					tmpRequestState.Query.addFilter(this.DAL.defaultGUIdentifier, tmpRequestState.Record[this.DAL.defaultGUIdentifier]);
					tmpRequestState.UpsertCreateOnly = false;
				}
				if ((typeof(tmpRequestState.Record[this.DAL.defaultIdentifier]) !== 'undefined') && (tmpRequestState.Record[this.DAL.defaultIdentifier] > 0))
				{
					tmpRequestState.Query.addFilter(this.DAL.defaultIdentifier, tmpRequestState.Record[this.DAL.defaultIdentifier]);
					tmpRequestState.UpsertCreateOnly = false;
				}

				return fStageComplete();
			},
			(fStageComplete) =>
			{
				if (tmpRequestState.UpsertCreateOnly)
				{
					tmpRequestState.Operation = 'Create';
					doCreate.call(this, tmpRequestState.Record, pRequest, tmpRequestState, pResponse, fStageComplete);
				}
				else
				{
					this.DAL.doRead(tmpRequestState.Query,
						(pError, pQuery, pRecord) =>
						{
							if (pError)
							{
								if (typeof(pError) == 'string')
								{
									return fStageComplete(this.ErrorHandler.getError(pError, 500));
								}
								else
								{
									return fStageComplete(pError);
								}
							}
							else if (!pRecord)
							{
								// Record not found -- do a create.
								tmpRequestState.Operation = 'Create';
								doCreate.call(this, tmpRequestState.Record, pRequest, tmpRequestState, pResponse, fStageComplete);
							}
							else
							{
								// Set the default ID in the passed-in record if it doesn't exist
								// or is zero (which is never a valid ID).
								if (!tmpRequestState.Record.hasOwnProperty(this.DAL.defaultIdentifier)
									|| !tmpRequestState.Record[this.DAL.defaultIdentifier])
								{
									tmpRequestState.Record[this.DAL.defaultIdentifier] = pRecord[this.DAL.defaultIdentifier];
								}
								// If the found record does not match the passed ID --- what the heck?!
								if (tmpRequestState.Record[this.DAL.defaultIdentifier] != pRecord[this.DAL.defaultIdentifier])
								{
									return fStageComplete(this.ErrorHandler.getError('Record IDs do not match', 500));
								}
								// Record found -- do an update.  Use the cached record, though.
								tmpRequestState.Operation = 'Update';
								doUpdate.call(this, tmpRequestState.Record, pRequest, tmpRequestState, pResponse, fStageComplete, pRecord);
							}
						});
				}
			},
			(fStageComplete) =>
			{
				// Now stuff the record into the upserted array
				if (tmpRequestState.Operation == 'Update')
				{
					if (tmpRequestState.RecordUpdateError)
					{
						return fStageComplete(tmpRequestState.RecordUpdateErrorObject);
					}
					if (tmpRequestState.UpdatedRecords.length < 1)
					{
						return fStageComplete(this.ErrorHandler.getError('Unknown record update failure - no updated records returned.', 500));
					}
		
					tmpRequestState.Record = tmpRequestState.UpdatedRecords[0];
				}
				else if (tmpRequestState.Operation == 'Create')
				{
					if (tmpRequestState.RecordCreateError)
					{
						return fStageComplete(tmpRequestState.RecordCreateErrorObject);
					}
					if (tmpRequestState.CreatedRecords.length < 1)
					{
						return fStageComplete(this.ErrorHandler.getError('Unknown record create failure - no created records returned.', 500));
					}
		
					tmpRequestState.Record = tmpRequestState.CreatedRecords[0];
				}
				else
				{
					return fStageComplete(this.ErrorHandler.getError('Unkknown record upsert failure = no records returned from doUpsert.', 500));
				}
				tmpRequestState.ParentRequestState.UpsertedRecords.push(tmpRequestState.Record);
				return fStageComplete();
			}
		], (pError) =>
		{
			if (pError)
			{
				tmpRequestState.Record.Error = pError;
				// Surface per-row failures back to the bulk caller. The
				// parent BulkUpsert endpoint reads this array to count
				// errors and signal partial-success to clients via a
				// response header. Without this push, individual upsert
				// failures vanish silently and the bulk response only
				// reflects what survived.
				if (tmpRequestState.ParentRequestState && Array.isArray(tmpRequestState.ParentRequestState.ErrorRecords))
				{
					let tmpErrorMessage = (pError && (pError.message || pError.Error)) ? (pError.message || pError.Error) : String(pError);
					tmpRequestState.ParentRequestState.ErrorRecords.push({
						Record: tmpRequestState.Record,
						Operation: tmpRequestState.Operation || 'Unknown',
						Error: tmpErrorMessage
					});
				}
			}
			return fCallback();
		});
};

module.exports = doUpsert;
