/**
* Meadow Operation - Create a record function
*/
const doCreate = function(pRecord, pRequest, pRequestState, pResponse, fCallback)
{
	// This is a virtual operation
	let tmpRequestState = this.cloneAsyncSafeRequestState(pRequestState, 'doCreate');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	if (!Array.isArray(tmpRequestState.ParentRequestState.CreatedRecords))
	{
		tmpRequestState.ParentRequestState.CreatedRecords = [];
	}

	this.waterfall(
	[
		(fStageComplete) =>
		{
			tmpRequestState.RecordToCreate = pRecord;

			//Make sure record gets created with a customerID
			if (!tmpRequestState.RecordToCreate.hasOwnProperty('IDCustomer') && this.DAL.jsonSchema && this.DAL.jsonSchema.properties && this.DAL.jsonSchema.properties.hasOwnProperty('IDCustomer'))
			{
				tmpRequestState.RecordToCreate.IDCustomer = tmpRequestState.SessionData.CustomerID || 0;
			}

			return fStageComplete();
		},
		(fStageComplete) => { this.BehaviorInjection.runBehavior(`Create-PreOperation`, this, pRequest, tmpRequestState, fStageComplete); },
		(fStageComplete) =>
		{
			// Prepare create query
			tmpRequestState.Query = this.DAL.query;
			this.stampSessionOverrideOnQuery(tmpRequestState);
			tmpRequestState.Query.setIDUser(tmpRequestState.SessionData.UserID);
			tmpRequestState.Query.addRecord(tmpRequestState.RecordToCreate);
			return fStageComplete();
		},
		(fStageComplete) => { this.BehaviorInjection.runBehavior(`Create-QueryConfiguration`, this, pRequest, tmpRequestState, fStageComplete); },
		(fStageComplete) =>
		{
			// Do the actual create operation with the DAL
			this.DAL.doCreate(tmpRequestState.Query,
				(pError, pQuery, pReadQuery, pNewRecord) =>
				{
					if (pError)
					{
						return fStageComplete(pError);
					}
					if (!pNewRecord)
					{
						return fStageComplete(this.ErrorHandler.getError(`Error in DAL Create: No record returned from persistence engine.`, 500));
					}

					tmpRequestState.Record = pNewRecord;

					return fStageComplete();
				});
		},
		(fStageComplete) => { return this.BehaviorInjection.runBehavior(`Create-PostOperation`, this, pRequest, tmpRequestState, fStageComplete); },
		(fStageComplete) =>
		{
			tmpRequestState.ParentRequestState.CreatedRecords.push(tmpRequestState.Record);
			this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, `Created a record with ${this.DAL.defaultIdentifier} = ${tmpRequestState.Record[this.DAL.defaultIdentifier]}`);
			return fStageComplete();
		}
	],
	(pError) =>
	{
		if (pError)
		{
			tmpRequestState.RecordToCreate.Error = pError;

			tmpRequestState.ParentRequestState.RecordCreateError = true;
			tmpRequestState.ParentRequestState.RecordCreateErrorObject = pError;

			tmpRequestState.ParentRequestState.CreatedRecords.push(tmpRequestState.RecordToCreate);
		}

		return fCallback();
	});
};

module.exports = doCreate;