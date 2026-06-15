/**
* Meadow Endpoint - Read the Max Value of a Column in a Set
*/
const doAPIEndpointReadMax = function(pRequest, pResponse, fNext)
{
	let tmpRequestState = this.initializeRequestState(pRequest, 'ReadMax');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	this.waterfall(
		[
			(fStageComplete) =>
			{
				tmpRequestState.Query = this.DAL.query;
				this.stampSessionOverrideOnQuery(tmpRequestState);
				return fStageComplete();
			},
			(fStageComplete) =>
			{
				tmpRequestState.ColumnName =  pRequest.params.ColumnName;
				tmpRequestState.Query.setSort({Column:tmpRequestState.ColumnName, Direction:'Descending'});
				tmpRequestState.Query.setCap(1);

				return fStageComplete();
			},
			fBehaviorInjector(`ReadMax-QueryConfiguration`),
			(fStageComplete) =>
			{
				this.DAL.doRead(tmpRequestState.Query, fStageComplete);
			},
			(pQuery, pRecord, fStageComplete) =>
			{
				if (!pRecord)
				{
					return fStageComplete(this.ErrorHandler.getError('Record not Found', 404));
				}
				tmpRequestState.Record = pRecord;
				return fStageComplete();
			},
			(fStageComplete) =>
			{
				this.BehaviorInjection.runBehavior(`ReadMax-PostOperation`, this, pRequest, tmpRequestState, fStageComplete);
			},
			(fStageComplete) =>
			{
				this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, `Read max record of ${this.DAL.scope} on ${tmpRequestState.ColumnName}`);
				pResponse.send(tmpRequestState.Record);
			}
		],
		(pError) =>
		{
			return this.ErrorHandler.handleErrorIfSet(pRequest, tmpRequestState, pResponse, pError, fNext);
		}
	);
};

module.exports = doAPIEndpointReadMax;