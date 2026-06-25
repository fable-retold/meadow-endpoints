/**
* Meadow Endpoint - Get the Record Schema
*
* @license MIT
*
* @author Steven Velozo <steven@velozo.com>
* @module Meadow
*/
var libVersion = require('../Meadow-Endpoints-Version.js');

/**
* Get the JSONSchema for a particular scope
*/
var doAPISchemaEndpoint = function(pRequest, pResponse, fNext)
{
	// This state is the requirement for the UserRoleIndex value in the UserSession object... processed by default as >=
	// The default here is that any authenticated user can use this endpoint.
	pRequest.EndpointAuthorizationRequirement = pRequest.EndpointAuthorizationLevels.Schema;
	
	// INJECT: Pre authorization (for instance to change the authorization level)

	if (pRequest.CommonServices.authorizeEndpoint(pRequest, pResponse, fNext) === false)
	{
		// If this endpoint fails, it's sent an error automatically.
		return;
	}

	// INJECT: Pre endpoint operation

	// Shallow-clone so the version metadata is not stamped onto the DAL's
	// shared jsonSchema object.
	var tmpSchema = Object.assign({}, pRequest.DAL.jsonSchema);

	// INJECT: After the schema is grabbed, let the user alter it

	// Advertise meadow-endpoints version & capability metadata so clients can
	// detect transport features (e.g. POST /Query) without probing routes.
	// Additive, non-standard key; JSON Schema consumers ignore unknown keywords.
	tmpSchema.RetoldMetadata = libVersion.getVersionMetadata();

	pRequest.CommonServices.log.info('Delivered a JSON schema for '+pRequest.DAL.scope, {SessionID:pRequest.UserSession.SessionID, RequestID:pRequest.RequestUUID, RequestURL:pRequest.url, Action:pRequest.DAL.scope+'-Schema'}, pRequest);
	pResponse.send(tmpSchema);
	return fNext();
};

module.exports = doAPISchemaEndpoint;