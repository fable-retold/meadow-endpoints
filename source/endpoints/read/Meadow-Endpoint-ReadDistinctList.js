/**
* Meadow Endpoint - Read a list of Records with a specified set of columns, distinct by those columns.
*/
const marshalDistinctList = require('./Meadow-Marshal-DistinctList.js');

const doAPIEndpointReadDistinct = function(pRequest, pResponse, fNext)
{
	let tmpRequestState = this.initializeRequestState(pRequest, 'ReadDistinct');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	tmpRequestState.DistinctColumns;

	this.waterfall(
	[
		(fStageComplete) =>
		{
			tmpRequestState.Query = this.DAL.query.setDistinct(true);
			this.stampSessionOverrideOnQuery(tmpRequestState);

			/** @type {number | boolean} */
			let tmpCap = false;
			/** @type {number | boolean} */
			let tmpBegin = false;
			if (typeof(pRequest.params.Begin) === 'string' ||
				typeof(pRequest.params.Begin) === 'number')
			{
				tmpBegin = parseInt(pRequest.params.Begin, 10);
			}
			if (typeof(pRequest.params.Cap) === 'string' ||
				typeof(pRequest.params.Cap) === 'number')
			{
				tmpCap = parseInt(pRequest.params.Cap, 10);
			}
			else
			{
				//maximum number of records to return by default on Read queries. Override via "MeadowDefaultMaxCap" fable setting.
				tmpCap = (this.settings['MeadowDefaultMaxCap']) || 250;
			}
			tmpRequestState.Query.setCap(tmpCap).setBegin(tmpBegin);
			if (typeof(pRequest.params.Filter) === 'string')
			{
				// If a filter has been passed in, parse it and add the values to the query.
				this.parseFilter(pRequest.params.Filter, tmpRequestState.Query);
			}
			else if (pRequest.params.Filter)
			{
				tmpRequestState.Query.setFilter(pRequest.params.Filter);
			}
			if (typeof(pRequest.params.Columns) === 'string')
			{
				tmpRequestState.DistinctColumns = pRequest.params.Columns.split(',');
				if (!tmpRequestState.DistinctColumns)
				{
					return fStageComplete({Code:400, Message:'Columns to distinct on must be provided.'});
				}
				tmpRequestState.Query.setDataElements(tmpRequestState.DistinctColumns);
			}
			return fStageComplete();
		},
		fBehaviorInjector(`Reads-QueryConfiguration`),
		(fStageComplete) =>
		{
			this.DAL.doReads(tmpRequestState.Query, fStageComplete);
		},
		(pQuery, pRecords, fStageComplete) =>
		{
			if (pRecords.length < 1)
			{
				pRecords = [];
			}
			tmpRequestState.Records = pRecords;
			return fStageComplete();
		},
		// Stage-specific post-op hook. Fires after DAL read but BEFORE
		// the records are projected to distinct-column shape, so
		// handlers can run against full rows. Separate from
		// Reads-PostOperation so registering one doesn't unintentionally
		// fire on the other. Hash matches the endpoint's action label
		// (initializeRequestState(..., 'ReadDistinct')).
		fBehaviorInjector(`ReadDistinct-PostOperation`),
		(fStageComplete) =>
		{
			tmpRequestState.ResultRecords = marshalDistinctList.call(this, tmpRequestState.Records, pRequest, tmpRequestState.DistinctColumns);
			return fStageComplete();
		},
		(fStageComplete) =>
		{
			return this.doStreamRecordArray(pResponse, tmpRequestState.ResultRecords, fStageComplete);
		},
		(fStageComplete) =>
		{
			this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, `Read a recordset distinct lite list with ${tmpRequestState.ResultRecords.length} results.`);
			return fStageComplete();
		}
	],
	(pError) =>
	{
		return this.ErrorHandler.handleErrorIfSet(pRequest, tmpRequestState, pResponse, pError, fNext);
	});
};

module.exports = doAPIEndpointReadDistinct;
