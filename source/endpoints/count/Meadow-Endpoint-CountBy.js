/**
* Meadow Endpoint - Count a Record filtered by a single value
*/
const doAPIEndpointCountBy = function(pRequest, pResponse, fNext)
{
	let tmpRequestState = this.initializeRequestState(pRequest, 'CountBy');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	this.waterfall(
		[
			(fStageComplete) =>
			{
				tmpRequestState.Query = this.DAL.query;
				this.stampSessionOverrideOnQuery(tmpRequestState);
				tmpRequestState.Query.addFilter(pRequest.params.ByField, pRequest.params.ByValue, '=', 'AND', 'RequestByField');
				return fStageComplete();
			},
			fBehaviorInjector(`CountBy-QueryConfiguration`),
			(fStageComplete) =>
			{
				this.DAL.doCount(tmpRequestState.Query,
					(pError, pQuery, pCount) =>
					{
						tmpRequestState.Result = {Count:pCount};
						return fStageComplete(pError);
					});
			},
			(fStageComplete) =>
			{
				this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, 'Delivered recordset count of '+tmpRequestState.Result.Count+'.');
				pResponse.send(tmpRequestState.Result);
				return fStageComplete();
			}
		],
		(pError) =>
		{
			return this.ErrorHandler.handleErrorIfSet(pRequest, tmpRequestState, pResponse, pError, fNext);
		});
};

module.exports = doAPIEndpointCountBy;