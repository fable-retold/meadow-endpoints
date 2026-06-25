/**
* Meadow Endpoints - Version & Capability Metadata
*
* Builds the diagnostic version map and capability advertisement that the
* Schema endpoint exposes to clients. Clients (e.g. the pict EntityProvider)
* read this to decide whether newer transport routes — such as the body-driven
* POST /1.0/:Entity/Query read — are available on a given deployment.
*
* The map is computed once and memoized; package versions do not change at
* runtime.
*
* @license MIT
*/

// Retold packages whose versions are surfaced for diagnostics. Best-effort:
// any that cannot be resolved are simply omitted from the map.
const REPORTED_PACKAGES = [ 'meadow', 'fable', 'fable-serviceproviderbase', 'meadow-filter', 'orator' ];

/** @type {MeadowEndpointsVersionMetadata|null} */
let _VersionMetadataCache = null;

/**
* Resolve a package's version from its package.json without throwing.
*
* @param {string} pPackageName - The npm package name to resolve.
*
* @return {string|undefined} The version string, or undefined if unresolvable.
*/
const safeResolveVersion = function(pPackageName)
{
	try
	{
		return require(`${pPackageName}/package.json`).version;
	}
	catch (pError)
	{
		return undefined;
	}
};

/**
* Resolve meadow-endpoints' own version from the package manifest.
*
* @return {string|undefined} The meadow-endpoints version, or undefined.
*/
const resolveOwnVersion = function()
{
	try
	{
		return require('../package.json').version;
	}
	catch (pError)
	{
		return undefined;
	}
};

/**
* @typedef {Object} MeadowEndpointsVersionMetadata
* @property {Record<string, string>} PackageVersions - Map of retold package name to resolved version (diagnostic).
* @property {Object} Capabilities - Feature flags a client can key behavior off of.
* @property {boolean} Capabilities.QueryEndpoint - Whether the body-driven POST /:Entity/Query read route is served.
*/

/**
* Build (and memoize) the version & capability metadata advertised on the
* Schema endpoint.
*
* @return {MeadowEndpointsVersionMetadata} The version metadata object.
*/
const getVersionMetadata = function()
{
	if (_VersionMetadataCache)
	{
		return _VersionMetadataCache;
	}

	/** @type {Record<string, string>} */
	const tmpPackageVersions = {};

	const tmpOwnVersion = resolveOwnVersion();
	if (tmpOwnVersion)
	{
		tmpPackageVersions['meadow-endpoints'] = tmpOwnVersion;
	}

	for (let i = 0; i < REPORTED_PACKAGES.length; i++)
	{
		const tmpVersion = safeResolveVersion(REPORTED_PACKAGES[i]);
		if (tmpVersion)
		{
			tmpPackageVersions[REPORTED_PACKAGES[i]] = tmpVersion;
		}
	}

	_VersionMetadataCache = (
		{
			PackageVersions: tmpPackageVersions,
			Capabilities:
			{
				// This module ships with the version of meadow-endpoints that
				// serves the POST /:Entity/Query route, so the capability is
				// always advertised here.
				QueryEndpoint: true
			}
		});

	return _VersionMetadataCache;
};

module.exports = { getVersionMetadata: getVersionMetadata };
