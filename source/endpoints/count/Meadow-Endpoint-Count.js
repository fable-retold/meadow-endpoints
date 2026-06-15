/**
* Meadow Endpoint - Count a Record
*/
const doAPIEndpointCount = function(pRequest, pResponse, fNext)
{
	let tmpRequestState = this.initializeRequestState(pRequest, 'Count');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	this.waterfall(
		[
			(fStageComplete) =>
			{
				tmpRequestState.Query = this.DAL.query;
				this.stampSessionOverrideOnQuery(tmpRequestState);
				if (typeof(pRequest.params.Filter) === 'string')
				{
					// If a filter has been passed in, parse it and add the values to the query.
					this.parseFilter(pRequest.params.Filter, tmpRequestState.Query);
				}
				else if (pRequest.params.Filter)
				{
					tmpRequestState.Query.setFilter(pRequest.params.Filter);
				}
				return fStageComplete();
			},
			fBehaviorInjector(`Count-QueryConfiguration`),
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
				pResponse.send(tmpRequestState.Result);
				this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, `Delivered recordset count of ${tmpRequestState.Result.Count} for ${this.DAL.scope}.`);
				return fStageComplete();
			}
		],
		(pError) =>
		{
			return this.ErrorHandler.handleErrorIfSet(pRequest, tmpRequestState, pResponse, pError, fNext);
		}
	);
};

module.exports = doAPIEndpointCount;
