/**
* Meadow Operation - Update a record
*/
const doUpdate = function(pRecordToModify, pRequest, pRequestState, pResponse, fCallback, pOptionalCachedUpdatingRecord)
{
	// This is a virtual operation
	let tmpRequestState = this.cloneAsyncSafeRequestState(pRequestState, 'doUpdate');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	// If there is not a default identifier or cached record, fail
	if ((pRecordToModify[this.DAL.defaultIdentifier] < 1) && (typeof(pOptionalCachedUpdatingRecord) === 'undefined'))
	{
		return fCallback('Record update failure - a valid record ID is required in the passed-in record.');
	}

	if (!Array.isArray(tmpRequestState.ParentRequestState.UpdatedRecords))
	{
		tmpRequestState.ParentRequestState.UpdatedRecords = [];
	}

	this.waterfall(
	[
		(fStageComplete) =>
		{
			tmpRequestState.RecordToModify = pRecordToModify;

			if (typeof(pOptionalCachedUpdatingRecord) !== 'undefined')
			{
				// Use the cached updating record instead of reading a record.
				tmpRequestState.OriginalRecord = pOptionalCachedUpdatingRecord;
				return fStageComplete();
			}
			else
			{
				tmpRequestState.Query = this.DAL.query;
				this.stampSessionOverrideOnQuery(tmpRequestState);

				tmpRequestState.Query.addFilter(this.DAL.defaultIdentifier, tmpRequestState.RecordToModify[this.DAL.defaultIdentifier]);

				// Load the record so we can do security checks on it
				this.DAL.doRead(tmpRequestState.Query,
					(pError, pQuery, pRecord) =>
					{
						if (pError)
						{
							return fStageComplete(pError);
						}
						if (!pRecord)
						{
							return fStageComplete(this.ErrorHandler.getError('Record not Found', 404));
						}
						tmpRequestState.Record = pRecord;
						// Alias the loaded pre-update row under an
						// unambiguous name. pRequestState.Record gets
						// overwritten with the POST-update row later in
						// this waterfall; OriginalRecord preserves the
						// PRE-update reference for post-op hooks that
						// need to compare before/after values (change
						// logs, customer-boundary checks, etc.).
						tmpRequestState.OriginalRecord = pRecord;
						return fStageComplete();
					});
			}
		},
		(fStageComplete) =>
		{
			tmpRequestState.Query = this.DAL.query;
			this.stampSessionOverrideOnQuery(tmpRequestState);
			return fStageComplete();
		},
		fBehaviorInjector(`Update-PreOperation`),
		(fStageComplete) =>
		{
			tmpRequestState.Query.setIDUser(tmpRequestState.SessionData.UserID);
			tmpRequestState.Query.addRecord(tmpRequestState.RecordToModify);

			return fStageComplete();
		},
		fBehaviorInjector(`Update-QueryConfiguration`),
		(fStageComplete) =>
		{
			this.DAL.doUpdate(tmpRequestState.Query,
				(pError, pQuery, pReadQuery, pRecord) =>
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
					if (!pRecord)
					{
						return fStageComplete(this.ErrorHandler.getError(`Error in DAL Update: No record returned from persistence engine.`, 500));
					}
					tmpRequestState.Record = pRecord;
					return fStageComplete();
				});
		},
		(fStageComplete) => { return this.BehaviorInjection.runBehavior(`Update-PostOperation`, this, pRequest, tmpRequestState, fStageComplete); },
		(fStageComplete) =>
		{
			tmpRequestState.ParentRequestState.UpdatedRecords.push(tmpRequestState.Record);
			this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, `Updated record with ID ${tmpRequestState.Record[this.DAL.defaultIdentifier]}`);
			return fStageComplete();
		}
	], (pError) =>
	{
		if (pError)
		{
			// Ensure we have a record object to attach the error to
			if (tmpRequestState.Record)
			{
				tmpRequestState.Record.Error = pError;
			}
			else
			{
				tmpRequestState.Record = { Error: pError };
			}

			tmpRequestState.ParentRequestState.RecordUpdateError = true;
			tmpRequestState.ParentRequestState.RecordUpdateErrorObject = pError;

			tmpRequestState.ParentRequestState.UpdatedRecords.push(tmpRequestState.Record);
		}

		return fCallback();
	});
};

module.exports = doUpdate;