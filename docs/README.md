# Meadow Endpoints

> Automagic REST endpoints for CRUD operations on the Retold framework

Meadow Endpoints generates a full suite of RESTful API routes from your Meadow data entities. Define your data model with Meadow, point Meadow Endpoints at it, and you get Create, Read, Update, Delete, Count, Schema, and Validate endpoints -- with authentication hooks, authorization, dynamic filtering, pagination, and behavior injection for customization. The design philosophy is to cover the 99% via configuration; the last 1% is easily hand-craftable.

## Features

- **Automatic Route Generation** - Full CRUD endpoints from a Meadow entity with zero boilerplate
- **Behavior Injection** - Pre/post operation hooks for authentication, authorization, and custom logic
- **Dynamic Filtering** - URL-based filter expressions for flexible querying
- **Pagination** - Built-in Begin/Cap parameters with configurable default limits
- **Bulk Operations** - Batch create, update, and upsert endpoints
- **Schema Endpoints** - Serve JSON Schema, default objects, and validation
- **Streaming Responses** - Large recordsets streamed as newline-delimited JSON
- **Controller Architecture** - Extensible controller system with replaceable error handling, logging, and session management
- **Fable Integration** - First-class service in the Fable/Orator ecosystem

## Quick Start

```javascript
const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');
const libMeadow = require('meadow');
const libMeadowEndpoints = require('meadow-endpoints');

const _Fable = new libFable({
	Product: 'MyAPI',
	ProductVersion: '1.0.0',
	ServicePort: 8086
});

// Set up Orator
_Fable.serviceManager.addServiceType('Orator', libOrator);
_Fable.serviceManager.addServiceType('OratorServiceServer', libOratorServiceServerRestify);
_Fable.serviceManager.instantiateServiceProvider('Orator');
_Fable.serviceManager.instantiateServiceProvider('OratorServiceServer');

// Create a Meadow DAL for "Book"
const tmpMeadow = libMeadow.new(_Fable, 'Book')
	.setProvider('MySQL')
	.setDefaultIdentifier('IDBook')
	.setSchema([
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'GUIDBook', Type: 'AutoGUID' },
		{ Column: 'Title', Type: 'String', Size: '255' },
		{ Column: 'Author', Type: 'String', Size: '128' },
		{ Column: 'CreateDate', Type: 'CreateDate' },
		{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
		{ Column: 'UpdateDate', Type: 'UpdateDate' },
		{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
		{ Column: 'Deleted', Type: 'Deleted' }
	]);

// Generate and connect endpoints
const tmpMeadowEndpoints = new libMeadowEndpoints(tmpMeadow);
tmpMeadowEndpoints.connectRoutes(_Fable.Orator.serviceServer);

// Start the server
_Fable.Orator.startService(() =>
{
	console.log('API running on port 8086');
	// Now available:
	//   GET    /1.0/Book/:IDBook       - Read one
	//   GET    /1.0/Book/s/:Begin/:Cap - Read many
	//   POST   /1.0/Book               - Create
	//   PUT    /1.0/Book               - Update
	//   DELETE /1.0/Book/:IDBook       - Delete
	//   GET    /1.0/Book/s/Count       - Count
	//   GET    /1.0/Book/Schema        - Schema
	//   ... and more
});
```

## Installation

```bash
npm install meadow-endpoints
```

## How It Works

Meadow Endpoints takes a configured Meadow DAL instance and registers HTTP routes with an Orator service server. Each route follows an async waterfall pattern with behavior injection points, allowing you to customize any step of the request lifecycle without replacing the endpoint implementation.

<!-- bespoke diagram: edit diagrams/how-it-works.mmd or .hints.json, then: npx pict-renderer-graph build modules/meadow/meadow-endpoints/docs -->
![How It Works](diagrams/how-it-works.svg)

## Generated Routes

### Create

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/{version}/{entity}` | Create a single record |
| POST | `/{version}/{entity}/s` | Bulk create (array of records) |

### Read

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/{version}/{entity}/:IDRecord` | Read a single record by ID |
| GET | `/{version}/{entity}/s` | Read records (default cap: 250) |
| GET | `/{version}/{entity}/s/:Begin/:Cap` | Read with pagination |
| GET | `/{version}/{entity}/s/FilteredTo/:Filter` | Read with filter |
| GET | `/{version}/{entity}/s/FilteredTo/:Filter/:Begin/:Cap` | Read with filter and pagination |
| GET | `/{version}/{entity}/s/By/:ByField/:ByValue` | Read filtered by field value |
| GET | `/{version}/{entity}/s/By/:ByField/:ByValue/:Begin/:Cap` | Field filter with pagination |
| GET | `/{version}/{entity}/Max/:ColumnName` | Get maximum value for a column |

### Specialized Read

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/{version}/{entity}/Select` | Select list ({Hash, Value} pairs) |
| GET | `/{version}/{entity}/Select/:Begin/:Cap` | Paginated select list |
| GET | `/{version}/{entity}/Select/FilteredTo/:Filter` | Filtered select list |
| GET | `/{version}/{entity}/s/Lite` | Lite list (minimal columns) |
| GET | `/{version}/{entity}/s/Lite/:Begin/:Cap` | Paginated lite list |
| GET | `/{version}/{entity}/s/LiteExtended/:ExtraColumns` | Lite list with extra columns |
| GET | `/{version}/{entity}/s/Distinct/:Columns` | Distinct values for columns |
| GET | `/{version}/{entity}/s/Distinct/:Columns/:Begin/:Cap` | Paginated distinct list |
| GET | `/{version}/{entity}/s/Distinct/:Columns/FilteredTo/:Filter` | Filtered distinct list |

### Update

| Method | Route | Description |
|--------|-------|-------------|
| PUT | `/{version}/{entity}` | Update a single record |
| PUT | `/{version}/{entity}/s` | Bulk update (array of records) |
| PUT | `/{version}/{entity}/Upsert` | Insert or update a record |
| PUT | `/{version}/{entity}/Upserts` | Bulk upsert (array of records) |

### Delete

| Method | Route | Description |
|--------|-------|-------------|
| DELETE | `/{version}/{entity}/:IDRecord` | Delete a record |
| DELETE | `/{version}/{entity}` | Delete (ID in request body) |
| GET | `/{version}/{entity}/Undelete/:IDRecord` | Undelete a soft-deleted record |

### Count

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/{version}/{entity}/s/Count` | Total record count |
| GET | `/{version}/{entity}/s/Count/FilteredTo/:Filter` | Filtered count |
| GET | `/{version}/{entity}/s/Count/By/:ByField/:ByValue` | Count by field value |

### Schema

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/{version}/{entity}/Schema` | Return JSON Schema |
| GET | `/{version}/{entity}/Schema/New` | Return empty default record |
| POST | `/{version}/{entity}/Schema/Validate` | Validate a record against schema |

## Behavior Injection

Behavior injection lets you hook into any endpoint's lifecycle without replacing the endpoint itself. This is the primary mechanism for adding authentication, authorization, and custom business logic.

### Injection Points

Each endpoint has named injection points following the pattern `{Verb}-{Phase}`:

| Injection Point | When It Runs |
|----------------|--------------|
| `Create-PreOperation` | Before record creation |
| `Create-QueryConfiguration` | After query is built, before execution |
| `Create-PostOperation` | After record is created |
| `Read-PreOperation` | Before single record read |
| `Read-QueryConfiguration` | After read query is built |
| `Read-PostOperation` | After record is retrieved |
| `Reads-QueryConfiguration` | After reads query is built |
| `Reads-PostOperation` | After recordset is retrieved |
| `Update-QueryConfiguration` | After update query is built |
| `Delete-QueryConfiguration` | After delete query is built |
| `Delete-PreOperation` | Before deletion (after pre-read) |
| `Delete-PostOperation` | After deletion |
| `Count-QueryConfiguration` | After count query is built |

### Registering Behaviors

```javascript
const tmpEndpoints = new libMeadowEndpoints(tmpMeadow);

// Add authorization: restrict reads to user's own customer
tmpEndpoints.controller.BehaviorInjection.setBehavior('Reads-QueryConfiguration',
	(pRequest, pRequestState, fCallback) =>
	{
		if (pRequestState.SessionData.UserRoleIndex < 5)
		{
			pRequestState.Query.addFilter('IDCustomer', pRequestState.SessionData.CustomerID);
		}
		return fCallback();
	});

// Add validation before create
tmpEndpoints.controller.BehaviorInjection.setBehavior('Create-PreOperation',
	(pRequest, pRequestState, fCallback) =>
	{
		if (!pRequest.body.Title)
		{
			return fCallback({ Code: 400, Message: 'Title is required' });
		}
		return fCallback();
	});
```

## Dynamic Filtering

Filter expressions can be passed in endpoint URLs using the `FilteredTo` parameter:

```
GET /1.0/Book/s/FilteredTo/Title~JavaScript
GET /1.0/Book/s/FilteredTo/Author=Frank Herbert
GET /1.0/Book/s/FilteredTo/Price>20
```

Supported operators: `=`, `!=`, `>`, `<`, `>=`, `<=`, `~` (contains)

## Session Management

Meadow Endpoints supports multiple session data sources, configured via `MeadowEndpointsSessionDataSource`:

| Source | Description |
|--------|-------------|
| `Request` (default) | Session from `pRequest.UserSession` (set by Orator middleware) |
| `Header` | JSON session from `x-trusted-session` HTTP header |
| `None` | No session data, uses defaults |

The session object provides `UserID`, `CustomerID`, `SessionID`, `UserRole`, `UserRoleIndex`, and `LoggedIn` to all endpoint operations.

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `MeadowEndpointVersion` | string | `"1.0"` | API version prefix in routes |
| `MeadowDefaultMaxCap` | number | `250` | Default pagination limit for reads |
| `MeadowEndpointsSessionDataSource` | string | `"Request"` | Session data source |
| `MeadowEndpointsDefaultSessionObject` | object | `{CustomerID:0, UserID:0, ...}` | Default session template |
| `SendErrorStatusCodes` | boolean | `true` | Set HTTP status codes on error responses; set to `false` to answer errors at the transport's default status |

## Custom Controllers

For deep customization, extend the base controller:

```javascript
const libMeadowEndpoints = require('meadow-endpoints');
const BaseController = libMeadowEndpoints.BaseController;

class CustomController extends BaseController
{
	constructor(pMeadowEndpoints, pOptions)
	{
		super(pMeadowEndpoints, pOptions);
	}
}

const tmpEndpoints = new libMeadowEndpoints(tmpMeadow,
	{ ControllerClass: CustomController });
```

## Disabling Endpoint Groups

```javascript
const tmpEndpoints = new libMeadowEndpoints(tmpMeadow);

// Disable update and delete endpoints
tmpEndpoints._EnabledBehaviorSets.Update = false;
tmpEndpoints._EnabledBehaviorSets.Delete = false;

tmpEndpoints.connectRoutes(serviceServer);
// Only Create, Read, Count, and Schema endpoints will be registered
```

## CRUD Deep Dive

For detailed documentation on each endpoint group, including request lifecycles, behavior injection examples, and real-world usage patterns, see the [CRUD documentation](crud/README.md):

- [Create](crud/create.md) - Single and bulk record creation with pre/post hooks
- [Read](crud/read.md) - Records, lists, pagination, filtering, select lists, lite and distinct projections
- [Update](crud/update.md) - Single and bulk updates, upserts
- [Delete](crud/delete.md) - Soft-delete and undelete with authorization hooks
- [Count](crud/count.md) - Record counts with filtering
- [Schema, New & Validate](crud/schema.md) - Metadata, default records, and validation with full hook examples

## Testing

```bash
npm test
```

## Documentation

Detailed documentation is available in the `docs/` folder and can be served locally:

```bash
npx docsify-cli serve docs
```

## Related Packages

- [meadow](https://fable-retold.github.io/meadow/) - Data access layer (required)
- [meadow-filter](https://github.com/fable-retold/meadow-filter) - URL filter expression parser
- [orator](https://fable-retold.github.io/orator/) - API server abstraction
- [orator-serviceserver-restify](https://fable-retold.github.io/orator-serviceserver-restify/) - Restify service server
- [stricture](https://fable-retold.github.io/stricture/) - Schema definition language
- [foxhound](https://fable-retold.github.io/foxhound/) - Query DSL for SQL generation
- [fable](https://fable-retold.github.io/fable/) - Service provider framework
