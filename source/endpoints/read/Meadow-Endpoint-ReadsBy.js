/**
* Meadow Endpoint - Read a Record
*/
const doAPIEndpointReadsBy = function(pRequest, pResponse, fNext)
{
	let tmpRequestState = this.initializeRequestState(pRequest, 'ReadsBy');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	this.waterfall(
		[
			// 1. Construct the Query
			(fStageComplete) =>
			{
				tmpRequestState.Query = this.DAL.query;
				this.stampSessionOverrideOnQuery(tmpRequestState);

				/** @type {number | boolean} */
				var tmpCap = false;
				/** @type {number | boolean} */
				var tmpBegin = false;
				if (typeof(pRequest.params.Begin) === 'string' ||
					typeof(pRequest.params.Begin) === 'number')
				{
					tmpBegin = parseInt(pRequest.params.Begin);
				}
				if (typeof(pRequest.params.Cap) === 'string' ||
					typeof(pRequest.params.Cap) === 'number')
				{
					tmpCap = parseInt(pRequest.params.Cap);
				}
				else
				{
					//maximum number of records to return by default on Read queries. Override via "MeadowDefaultMaxCap" fable setting.
					tmpCap = (this.settings['MeadowDefaultMaxCap']) || 250;
				}
				tmpRequestState.Query.setCap(tmpCap).setBegin(tmpBegin);

				return fStageComplete();
			},
			(fStageComplete) =>
			{
				function addField(pByField, pByValue)
				{
					if (pByValue.constructor === Array)
					{
						tmpRequestState.Query.addFilter(pByField, pByValue, 'IN', 'AND', 'RequestByField');
					}
					else
					{
						tmpRequestState.Query.addFilter(pByField, pByValue, '=', 'AND', 'RequestByField');
					}
				}

				var tmpFilters = pRequest.params.Filters;
				if (tmpFilters &&
					tmpFilters.constructor === Array)
				{
					tmpFilters.forEach(function(filter)
					{
						addField(filter.ByField, filter.ByValue);
					});
				}
				else
				{
					addField(pRequest.params.ByField, pRequest.params.ByValue);
				}

				return fStageComplete();
			},
			fBehaviorInjector(`Reads-QueryConfiguration`),
			(fStageComplete) =>
			{
				this.DAL.doReads(tmpRequestState.Query,
					(pError, pQuery, pRecords) =>
					{
						if (!pRecords)
						{
							return fStageComplete(this.ErrorHandler.getError('No records found.', 404));
						}
						tmpRequestState.Records = pRecords;
						return fStageComplete();
					});
			},
			fBehaviorInjector(`Reads-PostOperation`),
			(fStageComplete) =>
			{
				return this.doStreamRecordArray(pResponse, tmpRequestState.Records, fStageComplete);
			},
			(fStageComplete) =>
			{
				this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, `Read a list of records by ${pRequest.params.ByField} = ${pRequest.params.ByValue}`);
				return fStageComplete();
			}
		],
		// 7. Return the results to the user
		(pError) =>
		{
			return this.ErrorHandler.handleErrorIfSet(pRequest, tmpRequestState, pResponse, pError, fNext);
		}
	);
};

module.exports = doAPIEndpointReadsBy;
