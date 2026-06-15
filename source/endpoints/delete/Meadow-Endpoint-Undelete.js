/**
* Meadow Endpoint - Undelete a Record
*/
const doAPIEndpointUndelete = function(pRequest, pResponse, fNext)
{
	let tmpRequestState = this.initializeRequestState(pRequest, 'Undelete');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

		var tmpIDRecord = 0;
	if (typeof(pRequest.params.IDRecord) === 'string')
	{
		tmpIDRecord = pRequest.params.IDRecord;
	}
	else if (typeof(pRequest.body[this.DAL.defaultIdentifier]) === 'number')
	{
		tmpIDRecord = pRequest.body[this.DAL.defaultIdentifier];
	}
	else if (typeof(pRequest.body[this.DAL.defaultIdentifier]) === 'string')
	{
		tmpIDRecord = pRequest.body[this.DAL.defaultIdentifier];
	}
	// Although the undelete request does allow multiple undeletes, we require an identifier.
	// TODO: Decide if we want to keep this pattern similar to Delete, or, if we want to change it to allow bulk undeletes.
	if (tmpIDRecord < 1)
	{
		return fNext(this.ErrorHandler.getError('Record undelete failure - a valid record ID is required.', 500));
	}

	tmpRequestState.RecordCount = {Count:0};

	this.waterfall(
		[
			(fStageComplete) =>
			{
				// Validate that the schema has a deleted bit
				var tmpSchema = this.DAL.schema;
				var tmpHasDeletedBit = false;
				for (let i = 0; i < tmpSchema.length; i++)
				{
					if (tmpSchema[i].Type == 'Deleted')
					{
						tmpHasDeletedBit = true;
					}
				}

				if (!tmpHasDeletedBit)
				{
					return fStageComplete(this.ErrorHandler.getError('No undelete bit on record.', 500));
				}

				return fStageComplete();
			},
			(fStageComplete) =>
			{
				// Now see if the record, with this identifier, for this user, exists with the deleted bit set to 1
				tmpRequestState.Query = this.DAL.query;
				this.stampSessionOverrideOnQuery(tmpRequestState);
				tmpRequestState.Query.addFilter(this.DAL.defaultIdentifier, tmpIDRecord);
				tmpRequestState.Query.addFilter('Deleted', 1);
				tmpRequestState.Query.setIDUser(tmpRequestState.SessionData.UserID);
				return fStageComplete();
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
						// Alias the loaded pre-undelete row for symmetry
						// with Update / Delete (see their endpoints). Post-op
						// hooks that compare pre/post values can reliably
						// read OriginalRecord.
						tmpRequestState.OriginalRecord = pRecord;
						return fStageComplete();
					});
			},
			(fStageComplete) =>
			{
				return this.BehaviorInjection.runBehavior(`Undelete-PreOperation`, this, pRequest, tmpRequestState, fStageComplete);
			},
			(fStageComplete) =>
			{
				// Do the undelete
				this.DAL.doUndelete(tmpRequestState.Query,
					(pError, pQuery, pCount) =>
					{
						// MySQL returns the number of rows deleted
						tmpRequestState.RecordCount = {Count:pCount};
						return fStageComplete(pError);
					});
			},
			(fStageComplete) =>
			{
				return this.BehaviorInjection.runBehavior(`Undelete-PostOperation`, this, pRequest, tmpRequestState, fStageComplete);
			},
			(fStageComplete) =>
			{
				pResponse.send(tmpRequestState.RecordCount);
				this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, 'Undeleted '+tmpRequestState.RecordCount.Count+' records with ID '+tmpIDRecord+'.');
				return fStageComplete();
			}
		], (pError) =>
		{
			return this.ErrorHandler.handleErrorIfSet(pRequest, tmpRequestState, pResponse, pError, fNext);
		}
	);
};

module.exports = doAPIEndpointUndelete;
