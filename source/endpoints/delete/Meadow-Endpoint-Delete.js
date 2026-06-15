/**
* Meadow Endpoint - Delete a Record
*/
const doAPIEndpointDelete = function(pRequest, pResponse, fNext)
{
	let tmpRequestState = this.initializeRequestState(pRequest, 'Delete');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	tmpRequestState.IDRecord = 0;
	tmpRequestState.RecordCount = { Count:0 };

	this.waterfall(
		[
			(fStageComplete) =>
			{
				if (typeof(pRequest.params.IDRecord) === 'string')
				{
					tmpRequestState.IDRecord = pRequest.params.IDRecord;
				}
				else if (typeof(pRequest.body[this.DAL.defaultIdentifier]) === 'number')
				{
					tmpRequestState.IDRecord = pRequest.body[this.DAL.defaultIdentifier];
				}
				else if (typeof(pRequest.body[this.DAL.defaultIdentifier]) === 'string')
				{
					tmpRequestState.IDRecord = pRequest.body[this.DAL.defaultIdentifier];
				}
				// Although the Meadow delete behavior does allow multiple deletes, we require an identifier.
				// If a developer wants bulk delete, it will require a custom endpoint.
				if (tmpRequestState.IDRecord < 1)
				{
					return fStageComplete(this.ErrorHandler.getError('Record delete failure - a valid record ID is required in the passed-in record.', 500));
				}
				return fStageComplete();
			},
			(fStageComplete) =>
			{
				tmpRequestState.Query = this.DAL.query;
				this.stampSessionOverrideOnQuery(tmpRequestState);
				tmpRequestState.Query.addFilter(this.DAL.defaultIdentifier, tmpRequestState.IDRecord);
				tmpRequestState.Query.setIDUser(tmpRequestState.SessionData.UserID);
				return fStageComplete();
			},
			(fStageComplete) =>
			{
				return this.BehaviorInjection.runBehavior(`Delete-QueryConfiguration`, this, pRequest, tmpRequestState, fStageComplete);
			},
			(fStageComplete) =>
			{
				// Load the record so we can do security checks on it
				this.DAL.doRead(tmpRequestState.Query,
					(pError, pQuery, pRecord) =>
					{
						if (!pRecord)
						{
							return fStageComplete(this.ErrorHandler.getError('Record not found.', 404));
						}
						tmpRequestState.Record = pRecord;
						// Alias the loaded pre-delete row for symmetry
						// with Update (see Meadow-Operation-Update.js).
						// Post-op hooks that compare pre/post values can
						// reliably read OriginalRecord without having to
						// know which stage overwrote Record.
						tmpRequestState.OriginalRecord = pRecord;
						return fStageComplete();
					});
			},
			(fStageComplete) =>
			{
				return this.BehaviorInjection.runBehavior(`Delete-PreOperation`, this, pRequest, tmpRequestState, fStageComplete);
			},
			(fStageComplete) =>
			{
				// Do the delete
				this.DAL.doDelete(tmpRequestState.Query,
					(pError, pQuery, pCount) =>
					{
						// MySQL returns the number of rows deleted
						tmpRequestState.RecordCount.Count = pCount;
						return fStageComplete(pError);
					});
			},
			(fStageComplete) =>
			{
				return this.BehaviorInjection.runBehavior(`Delete-PostOperation`, this, pRequest, tmpRequestState, fStageComplete);
			},
			(fStageComplete) =>
			{
				pResponse.send(tmpRequestState.RecordCount);
				this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, `Deleted ${tmpRequestState.RecordCount.Count} ${this.DAL.scope} records with ID ${tmpRequestState.IDRecord}`);
				return fStageComplete();
			}
		], (pError) =>
		{
			return this.ErrorHandler.handleErrorIfSet(pRequest, tmpRequestState, pResponse, pError, fNext);
		}
	);
};

module.exports = doAPIEndpointDelete;