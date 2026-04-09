> ℹ No Figma design loaded. This prompt includes connectors, templates and codebase conventions only. Extract a Figma design to add design tokens and page layers.

# Design Memory

## Role
You are a UI engineer implementing a Figma design.
Your ONLY source of truth is the design memory JSON extracted in this session.
Do NOT infer, assume, or invent any design decision not present in these files.
The design memory is structured as 8 ordered layers — load only the layers your task requires.

## Layer hierarchy
```
Token → Style → Component → Pattern → Template → Page → Flow → Prototype
```
Each layer file depends only on the layers to its left via $ref_* keys.

## Files
| # | Layer | File | Contents |
|---|-------|------|----------|
| 1 | Token | design-memory-token.json | Primitive colors · spacing scale · radii · type scale |
| 2 | Style | design-memory-style.json | Named Figma color · text · effect styles |
| 3 | Component | design-memory-component.json | Atomic reusable Figma components |
| 4 | Pattern | design-memory-pattern.json | Component sets & variant groups |
| 5 | Template | design-memory-template.json | Auto-layout frame structures & slot definitions |
| 6 | Page | design-memory-page.json | Full screen layout hierarchy |
| 7 | Flow | design-memory-flow.json | User journey paths & navigation sequences |
| 8 | Prototype | design-memory-prototype.json | Interactions, triggers & transition animations |

## Dependency graph
```
token
└─ style          ($ref_token)
   └─ component   ($ref_style)
      └─ pattern  ($ref_component)
         └─ template  ($ref_pattern, $ref_style)
            └─ page  ($ref_template)
               └─ flow  ($ref_page)
                  └─ prototype  ($ref_flow)
                     └─ connector  ($ref_component, $ref_style, $ref_page)
```
connector.json cross-references component, style, and page layers to map Figma components → code components with usage examples.

## Rules
1. ONLY use design data present in the session JSON files — never infer or invent values
2. MAP style.colors values to variables/tokens in your target framework
3. USE style.typography for all font sizes, weights, and line heights
4. FOLLOW page.pages[].frames[].children for screen layout hierarchy
5. IMPLEMENT prototype.connections for routing — each is a navigation event
6. NEVER invent hex values — resolve from style.colors or token.colors
7. RESOLVE $ref_* keys to load the referenced layer file as needed
8. COMPONENT names in component.json map to reusable UI components in your target framework
9. PATTERN sets in pattern.json are Figma variant groups (e.g. Button/Primary)
10. APPLY the same rules regardless of UI framework (React, Vue, Svelte, Angular, plain HTML, etc.)

## Summary
- Pages: —
- Style colors: 0 ()
- Text styles: 0 ()
- Components: 0 atoms · 0 patterns · 0 templates
- Prototype: 0 connections across 0 flows
- Connectors: 0 mapped to Vue2
- Code template: none selected


## Agent Pipeline — Dev Pipeline
**Execution Mode**: Sequential
Sub-agents execute in sequence — each agent's instruction output feeds into the next, then results are returned to the Master Agent.

### Master Agent (Orchestrator): 🎯 Orchestrator
- **Role**: Orchestrate sub-agents, route tasks, review IDE feedback, and produce final output to developer
- **Traits**: Proactive, Empathetic, Analytical, Creative
- **Communication**: Formal, Casual, Technical, Friendly
- **Mission**: Drive architectural decisions and ensure design consistency
- **Feedback Behavior**: Loop — Master Agent receives IDE feedback/diff and iterates further with sub-agents until complete.
- **Output Format**: Summary — high-level description of changes made

### Pipeline Flow
```
Developer Input → Prompt Builder → 🎯 Orchestrator
🎯 Orchestrator → [routes tasks to sub-agents]
  Sub-Agent 1 (Task A) → Generate Instruction → IDE AI → Execute
IDE AI → Feedback / Diff → 🎯 Orchestrator
🎯 Orchestrator → Final Output / Summary to Developer
```

### Sub-Agents
Each sub-agent generates targeted instructions for the IDE AI based on its task scope.

#### Sub-Agent 1: ⚡ Innovator — Task A
- **Instruction Scope**: Generate Code
- **Domain**: full-stack
- **Traits**: Proactive, Empathetic, Analytical, Creative
- **Style**: Formal, Casual, Technical, Friendly
- **Mission**: Drive architectural decisions and ensure design consistency

## Codebase Conventions
# JobLogic Codebase Guide

**A comprehensive reference for code patterns, architecture, and file generation templates**

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Folder Organization](#folder-organization)
3. [Naming Conventions](#naming-conventions)
4. [Code Patterns](#code-patterns)
5. [File Generation Templates](#file-generation-templates)
6. [Architecture & Design Patterns](#architecture--design-patterns)
7. [Configuration Reference](#configuration-reference)
8. [Common Workflows](#common-workflows)

---

## Project Overview

**JobLogic** is a large-scale **ASP.NET Core web application** with a **microservices architecture**. It manages job operations, quotes, assets, priorities, and more through a modular, permission-based system.

- **Framework:** ASP.NET Core (.NET 6+)
- **Frontend:** Server-rendered CSHTML views + Vue.js components
- **Backend:** Microservice clients, Repository pattern with MongoDB
- **Data Store:** MongoDB
- **Architecture:** Layered + Microservices (contract-based)

---

## Folder Organization

### Core Folder Structure

```
JobLogic/
├── Controllers/                    # HTTP request handlers
│   ├── {Entity}Controller.cs        # MVC controllers (page-based)
│   └── Api/{Entity}Controller.cs    # RESTful API endpoints
├── Views/                           # Server-rendered pages
│   └── {Module}/
│       ├── Index.cshtml             # List/search page
│       ├── Detail.cshtml            # Entity detail page
│       ├── Create.cshtml            # Creation page
│       ├── {Feature}/
│       │   └── _Partial.cshtml      # Nested partial views
│       └── _Components.cshtml       # Reusable components
├── Models/                          # ViewModels & DTOs
│   └── {Entity}/
│       ├── {Entity}_ViewModel.cs    # Main view model
│       ├── {Entity}Detail_ViewModel.cs
│       ├── {Entity}Search_ViewModel.cs
│       └── {Entity}SearchItem_ViewModel.cs
├── Services/                        # Business logic & integrations
│   ├── Tenantless/                  # Non-tenant services
│   │   └── {Entity}Service.cs
│   ├── Tenancy/                     # Tenant-scoped services
│   │   └── {Entity}Service.cs
│   └── Models/                      # Service DTOs
├── Repositories/                    # Data access layer
│   └── {Entity}Repository.cs
├── DAL/                             # DbContext & domain models
│   └── Domains/
├── Helpers/                         # Utility functions
│   └── {Domain}Helper.cs
├── Attributes/                      # Custom filters & validators
│   └── {Name}Attribute.cs
├── Enums/                           # Application enumerations
├── Extensions/                      # Extension methods
├── ViewComponents/                  # Reusable view components
├── wwwroot/
│   ├── js/
│   │   └── joblogic/
│   │       └── {module}/{feature}.js
│   └── scss/
│       └── pages/
│           └── {module}.scss
├── bundleconfig.json                # Main JS/CSS bundles
├── bundle-config-js.json            # Page-specific JS bundles
├── bundle-config-css.json           # CSS bundles
├── bundle-config-common-components.json
├── pages-config.yaml                # Page configuration & routing
└── Program.cs                       # Startup configuration
```

---

## Naming Conventions

### File Naming Reference

| **File Type** | **Convention** | **Example** |
|---------------|----------------|-----------|
| **Controller** | PascalCase | `PriorityController.cs`, `PurchaseOrderController.cs` |
| **API Controller** | {Entity}Controller | `QuoteRequestController.cs` (in Controllers/Api/) |
| **ViewModel** | {Entity}_ViewModel | `Priority_ViewModel.cs` |
| **Detail ViewModel** | {Entity}Detail_ViewModel | `PriorityDetail_ViewModel.cs` |
| **Search ViewModel** | {Entity}Search_ViewModel | `PrioritySearch_ViewModel.cs` |
| **Search Item ViewModel** | {Entity}SearchItem_ViewModel | `PrioritySearchItem_ViewModel.cs` |
| **Service** | {Scope}Service | `AccountAuthenticationService.cs` |
| **Repository** | {Entity}Repository | `UserSessionRepository.cs` |
| **Helper** | {Domain}Helper | `IdentityHelper.cs`, `DateHelper.cs` |
| **Attribute** | {Name}Attribute | `PermissionAttribute.cs`, `ModuleFilterFactory.cs` |
| **View (CSHTML)** | PascalCase | `Detail.cshtml`, `Index.cshtml`, `Create.cshtml` |
| **Partial View** | _PrefixedPascal | `_Detail.cshtml`, `_CreateBody.cshtml` |
| **JS Bundle** | camelCase | `ppmPriorityDetail.js`, `amfCustomerIndex.js` |
| **JS File** | camelCase.js | `detail.js`, `handlers.js`, `validators.js` |
| **CSS/SCSS** | kebab-case | `priority-detail.scss`, `quote-request.scss` |
| **Enum** | PascalCase (Screaming inside) | `UserPermission.PRIORITY_EDIT` |
| **Constants** | SCREAMING_SNAKE_CASE | `QUOTE_REQUEST_TABS`, `TABLE_COLUMNS` |

### Class/Member Naming

```csharp
// Controllers
public class {Entity}Controller : BaseJobLogicController { }
public async Task<ActionResult> {Action}(int id) { }
public async Task<JobLogicJsonResult> {Action}({Entity}Detail_ViewModel vm) { }

// Services
public class {Entity}Service : I{Entity}Service { }
public async Task<{Entity}> Get{Entity}ByIdAsync(/* params */) { }
public async Task<bool> {Verb}{Entity}Async(/* params */) { }

// Repositories
public class {Entity}Repository : BaseRepository<{Entity}> { }

// ViewModels
public class {Entity}_ViewModel
{
    public bool {Entity}{Action}Allowed { get; set; }  // Permissions
    public string SearchTerm { get; set; }              // Search
    public IPagedList<{Entity}SearchItem_ViewModel> Items { get; set; }  // Data
}

// Properties with Validation
[Display(Name = "Display Label")]
[Required(ErrorMessage = "...is required")]
[StringLength(128, ErrorMessage = "...")]
[Range(0, int.MaxValue)]
public string PropertyName { get; set; }
```

---

## Code Patterns

### 1. Base Controller Pattern

```csharp
// File: Controllers/PriorityController.cs
using JobLogic.Attributes;
using JobLogic.Models;
using JobLogic.Services;

namespace JobLogic.Controllers
{
    public class PriorityController : BaseJobLogicController
    {
        private readonly ICoreServiceClient _coreServiceClient;
        private readonly ILogger<PriorityController> _logger;

        public PriorityController(
            IScsAuthentication scsAuthentication,
            ILogger<PriorityController> logger,
            ICoreServiceClient coreServiceClient)
            : base(scsAuthentication, logger, coreServiceClient)
        {
            _coreServiceClient = coreServiceClient;
            _logger = logger;
        }

        #region List/Search

        [Permission(UserPermission.PRIORITY_VIEW)]
        public async Task<ActionResult> Index()
        {
            var vm = new PrioritySearch_ViewModel
            {
                ViewPriorityAllowed = CurrentUser.HavePermission(UserPermission.PRIORITY_VIEW),
                CreatePriorityAllowed = CurrentUser.HavePermission(UserPermission.PRIORITY_CREATE),
                ExportDataAllowed = CurrentUser.HavePermission(UserPermission.PRIORITY_EXPORT),
            };
            return View(vm);
        }

        #endregion

        #region Detail

        [Permission(UserPermission.PRIORITY_VIEW)]
        public async Task<ActionResult> Detail(int id)
        {
            var response = await _coreServiceClient.RequestAsync(
                new GetPriorityMsg { Id = id });

            if (!response.TryPick(out var priority))
                return RedirectToAction("Index");

            var vm = new Priority_ViewModel
            {
                ViewPriorityAllowed = CurrentUser.HavePermission(UserPermission.PRIORITY_VIEW),
                EditPriorityAllowed = CurrentUser.HavePermission(UserPermission.PRIORITY_EDIT),
                DeletePriorityAllowed = CurrentUser.HavePermission(UserPermission.PRIORITY_DELETE),
                Detail = new PriorityDetail_ViewModel
                {
                    Id = priority.Id,
                    Description = priority.Description,
                    // ... map fields
                }
            };
            return View(vm);
        }

        [HttpPost]
        [Permission(UserPermission.PRIORITY_EDIT)]
        public async Task<JobLogicJsonResult> EditDetail(PriorityDetail_ViewModel vm)
        {
            var response = await _coreServiceClient.RequestAsync(new UpdatePriorityMsg
            {
                Id = vm.Id,
                Description = vm.Description,
                // ... map request fields
            });

            return JsonResultHelper.JsonResultFactoryReturn(response,
                SuccessMessage: "Priority updated successfully",
                ErrorMessage: "Failed to update priority");
        }

        #endregion

        #region Create

        [Permission(UserPermission.PRIORITY_CREATE)]
        public ActionResult Create()
        {
            var vm = new PriorityDetail_ViewModel();
            return View("Create", vm);
        }

        [HttpPost]
        [Permission(UserPermission.PRIORITY_CREATE)]
        public async Task<JobLogicJsonResult> CreateDetail(PriorityDetail_ViewModel vm)
        {
            var response = await _coreServiceClient.RequestAsync(new CreatePriorityMsg
            {
                Description = vm.Description,
                // ... map fields
            });

            return JsonResultHelper.JsonResultFactoryReturn(response,
                SuccessMessage: "Priority created successfully");
        }

        #endregion

        #region Delete

        [HttpPost]
        [Permission(UserPermission.PRIORITY_DELETE)]
        public async Task<JobLogicJsonResult> DeleteDetail(int id)
        {
            var response = await _coreServiceClient.RequestAsync(
                new DeletePriorityMsg { Id = id });

            return JsonResultHelper.JsonResultFactoryReturn(response,
                SuccessMessage: "Priority deleted successfully");
        }

        #endregion
    }
}
```

### 2. API Controller Pattern (List/Search)

```csharp
// File: Controllers/Api/PriorityController.cs
using JobLogic.Attributes;
using JobLogic.Models;
using Microsoft.AspNetCore.Mvc;

namespace JobLogic.Controllers.Api
{
    [Route("api/[controller]")]
    [ApiController]
    [TypeFilter(typeof(ModuleFilterFactory), Arguments = new object[] { AppModule.Priority })]
    public class PriorityController : BaseJobLogicApiController
    {
        private readonly ICoreServiceClient _coreServiceClient;

        public PriorityController(
            IScsAuthentication scsAuthentication,
            ICoreServiceClient coreServiceClient)
            : base(scsAuthentication, coreServiceClient)
        {
            _coreServiceClient = coreServiceClient;
        }

        [HttpPost]
        [Route(nameof(Search))]
        [Permission(UserPermission.PRIORITY_VIEW)]
        public async Task<JobLogicJsonResult> Search([FromBody] PrioritySearch_ViewModel vm)
        {
            var response = await _coreServiceClient.RequestAsync(new GetPrioritiesMsg
            {
                SearchTerm = vm.SearchTerm,
                IncludeInactive = vm.IncludeInactive,
                PageNumber = vm.PageNumber,
                PageSize = vm.PageSize,
            });

            if (!response.TryPick(out var priorities))
                return JsonResultHelper.JsonResultFactoryReturn(response);

            return Ok(new
            {
                Items = priorities.Select(p => new PrioritySearchItem_ViewModel
                {
                    Id = p.Id,
                    Description = p.Description,
                    // ... map fields
                }).ToList(),
                TotalRecords = response.TotalCount,
                CurrentPage = vm.PageNumber,
                PageSize = vm.PageSize,
            });
        }
    }
}
```

### 3. ViewModel Pattern

```csharp
// File: Models/Priority/Priority_ViewModel.cs
using System.ComponentModel.DataAnnotations;
using X.PagedList;

namespace JobLogic.Models
{
    public class Priority_ViewModel
    {
        // Permissions
        public bool ViewPriorityAllowed { get; set; }
        public bool EditPriorityAllowed { get; set; }
        public bool DeletePriorityAllowed { get; set; }
        public bool CreatePriorityAllowed { get; set; }

        // Data
        public PriorityDetail_ViewModel Detail { get; set; }
    }

    public class PriorityDetail_ViewModel : BaseViewModel
    {
        public int Id { get; set; }

        [Display(Name = "Description")]
        [Required(ErrorMessage = "Description is required")]
        [StringLength(128, ErrorMessage = "Description must not exceed 128 characters")]
        public string Description { get; set; }

        [Display(Name = "Response Breach Time (Days)")]
        [Range(0, int.MaxValue, ErrorMessage = "Response time must be a positive number")]
        public int ResponseBreachTimeTotalDays { get; set; }

        [Display(Name = "Is Active")]
        public bool IsActive { get; set; }

        public DateTime CreatedOn { get; set; }
    }
}
```

### 4. Search ViewModel Pattern

```csharp
// File: Models/Priority/PrioritySearch_ViewModel.cs
using System.ComponentModel.DataAnnotations;
using X.PagedList;

namespace JobLogic.Models
{
    public class PrioritySearch_ViewModel : BaseSearchViewModel
    {
        // Permissions
        public bool ViewPriorityAllowed { get; set; }
        public bool CreatePriorityAllowed { get; set; }
        public bool ExportDataAllowed { get; set; }

        // Search filters
        [Display(Name = "Search")]
        public string SearchTerm { get; set; }

        [Display(Name = "Include Inactive")]
        public bool IncludeInactive { get; set; }

        // Results
        public IPagedList<PrioritySearchItem_ViewModel> Priorities { get; set; }
    }

    public class PrioritySearchItem_ViewModel : ICSVExportLine
    {
        public int Id { get; set; }

        [Display(Name = "Description")]
        public string Description { get; set; }

        [Display(Name = "Response Time (Days)")]
        public int ResponseBreachTimeTotalDays { get; set; }

        [Display(Name = "Status")]
        public string Status { get; set; }  // "Active" / "Inactive"

        // CSV Export support
        public Dictionary<string, object> GetCSVExportLine()
        {
            return new Dictionary<string, object>
            {
                { "Description", Description },
                { "Response Time", ResponseBreachTimeTotalDays },
                { "Status", Status },
            };
        }
    }
}
```

### 5. CSHTML View Patterns

#### **Index (List) Page**

```html
@* File: Views/Priority/Index.cshtml *@
@model PrioritySearch_ViewModel
@{
    ViewData["Title"] = "Priorities";
    ViewData["BreadcrumbItems"] = new[] { 
        new BreadcrumbItem { Text = "Settings", Url = Url.Action("Index", "Setting") },
        new BreadcrumbItem { Text = "Library", Url = Url.Action("Index", "Library") },
        new BreadcrumbItem { Text = "Priorities", IsCurrent = true }
    };
}

<!-- Page Header -->
<div class="page-header">
    <h1>Priority Management</h1>
    @if (Model.CreatePriorityAllowed)
    {
        <a class="jl-button-green" asp-action="Create" asp-controller="Priority">
            <i class="icon-plus"></i> Add Priority
        </a>
    }
</div>

<!-- Search Form -->
<form asp-action="Index" 
      asp-controller="Priority" 
      method="post" 
      id="searchForm" 
      class="jl-search-form">
    
    <div class="jl-search-box">
        <input type="text" 
               asp-for="@Model.SearchTerm" 
               placeholder="Search priorities..." 
               class="form-control" />
        
        <label asp-for="@Model.IncludeInactive" class="form-check-label">
            <input type="checkbox" asp-for="@Model.IncludeInactive" />
            Include Inactive
        </label>
        
        <button type="submit" class="jl-button-blue">Search</button>
        
        @if (Model.ExportDataAllowed)
        {
            <button type="button" class="jl-button-download" id="exportBtn">
                <i class="icon-download"></i> Export
            </button>
        }
    </div>
</form>

<!-- Data Grid -->
<div class="jl-table-wrapper">
    <jl-table id="priorityTable" 
              :columns="tableColumns" 
              :items="tableItems"
              @row-click="onRowClick">
        <template v-slot:tds="{item, col, displayFor}">
            <td v-if="displayFor(col, 'Description')" class="clickable">
                {{ item.description }}
            </td>
            <td v-if="displayFor(col, 'ResponseTime')">
                {{ item.responseBreachTimeTotalDays }} days
            </td>
            <td v-if="displayFor(col, 'Status')" class="status">
                <span :class="item.isActive ? 'badge-success' : 'badge-secondary'">
                    {{ item.isActive ? 'Active' : 'Inactive' }}
                </span>
            </td>
            <td v-if="displayFor(col, 'Actions')" class="actions">
                <a v-if="allowEdit" 
                   :href="`/Priority/Detail/${item.id}`"
                   class="action-link">Edit</a>
            </td>
        </template>
    </jl-table>
</div>

<!-- Pagination -->
<jl-paging :model="pagedModel" @page-change="onPageChange"></jl-paging>

<!-- JavaScript -->
<script asp-append-version="true" src="~/bundles/js/priorityIndex.js"></script>
```

#### **Detail Page**

```html
@* File: Views/Priority/Detail.cshtml *@
@model Priority_ViewModel
@{
    ViewData["Title"] = $"Priority: {Model.Detail.Description}";
    ViewData["BreadcrumbItems"] = new[] { 
        new BreadcrumbItem { Text = "Settings", Url = Url.Action("Index", "Setting") },
        new BreadcrumbItem { Text = "Priorities", Url = Url.Action("Index", "Priority") },
        new BreadcrumbItem { Text = Model.Detail.Description, IsCurrent = true }
    };
}

<!-- Page Header -->
<div class="page-header">
    <h1>@Model.Detail.Description</h1>
    @if (Model.EditPriorityAllowed)
    {
        <button type="button" id="editBtn" class="jl-button-primary">
            <i class="icon-edit"></i> Edit
        </button>
    }
    @if (Model.DeletePriorityAllowed)
    {
        <button type="button" id="deleteBtn" class="jl-button-danger">
            <i class="icon-trash"></i> Delete
        </button>
    }
</div>

<!-- Detail Form -->
<div class="jl-card">
    <partial name="Detail/_Detail" model="Model.Detail" />
</div>

<!-- Scripts -->
<script asp-append-version="true" src="~/bundles/js/priorityDetail.js"></script>
```

#### **Detail Partial**

```html
@* File: Views/Priority/Detail/_Detail.cshtml *@
@model PriorityDetail_ViewModel

<form asp-action="EditDetail" 
      asp-controller="Priority"
      method="post"
      id="detailForm"
      class="jl-edit-form">

    @Html.ValidationSummary(true, "", new { @class = "alert alert-danger" })
    @Html.HiddenFor(m => m.Id)

    <h3 class="card-title">
        <span>Priority Details</span>
        @if (ViewBag.AllowEdit)
        {
            <partial name="_SaveCancelPanel" />
        }
    </h3>

    <partial name="_CreateBody" model="Model" />

    <div class="form-group">
        <label>Created On</label>
        <p class="form-value">@Model.CreatedOn:G</p>
    </div>
</form>
```

#### **Create Body Partial (Reusable Form Fields)**

```html
@* File: Views/Priority/_CreateBody.cshtml *@
@model PriorityDetail_ViewModel

<div class="form-group">
    <label asp-for="@Model.Description"></label>
    <input type="text" 
           asp-for="@Model.Description" 
           class="form-control"
           maxlength="128"
           placeholder="Enter priority description" />
    <span asp-validation-for="@Model.Description" class="text-danger"></span>
</div>

<div class="form-group">
    <label asp-for="@Model.ResponseBreachTimeTotalDays"></label>
    <input type="number" 
           asp-for="@Model.ResponseBreachTimeTotalDays" 
           class="form-control"
           min="0"
           step="1"
           placeholder="Number of days" />
    <span asp-validation-for="@Model.ResponseBreachTimeTotalDays" class="text-danger"></span>
</div>

<div class="form-group">
    <label class="form-check-label">
        <input type="checkbox" asp-for="@Model.IsActive" class="form-check-input" />
        <span>Is Active</span>
    </label>
</div>
```

### 6. Service Pattern

```csharp
// File: Services/Tenantless/PriorityService.cs
using JobLogic.DAL;
using JobLogic.Repositories;

namespace JobLogic.Services.Tenantless
{
    public interface IPriorityService
    {
        Task<Priority> GetByIdAsync(int id);
        Task<List<Priority>> GetAllAsync(bool includeInactive = false);
        Task<Priority> CreateAsync(Priority priority);
        Task<bool> UpdateAsync(int id, Priority priority);
        Task<bool> DeleteAsync(int id);
    }

    public class PriorityService : IPriorityService
    {
        private readonly IPriorityRepository _repository;
        private readonly ILogger<PriorityService> _logger;

        public PriorityService(
            IPriorityRepository repository,
            ILogger<PriorityService> logger)
        {
            _repository = repository;
            _logger = logger;
        }

        public async Task<Priority> GetByIdAsync(int id)
        {
            try
            {
                return await _repository.GetByIdAsync(id);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error retrieving priority with ID: {id}");
                throw;
            }
        }

        public async Task<List<Priority>> GetAllAsync(bool includeInactive = false)
        {
            try
            {
                var priorities = await _repository.GetAllAsync();
                return includeInactive ? priorities : priorities.Where(p => p.IsActive).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving all priorities");
                throw;
            }
        }

        public async Task<Priority> CreateAsync(Priority priority)
        {
            try
            {
                priority.CreatedOn = DateTime.UtcNow;
                await _repository.CreateAsync(priority);
                _logger.LogInformation($"Priority created: {priority.Description}");
                return priority;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating priority");
                throw;
            }
        }

        public async Task<bool> UpdateAsync(int id, Priority priority)
        {
            try
            {
                priority.Id = id;
                priority.ModifiedOn = DateTime.UtcNow;
                var result = await _repository.UpdateAsync(id, priority);
                _logger.LogInformation($"Priority updated: {priority.Description}");
                return result.ModifiedCount > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error updating priority with ID: {id}");
                throw;
            }
        }

        public async Task<bool> DeleteAsync(int id)
        {
            try
            {
                var result = await _repository.DeleteAsync(id);
                _logger.LogInformation($"Priority deleted: ID {id}");
                return result.DeletedCount > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error deleting priority with ID: {id}");
                throw;
            }
        }
    }
}
```

### 7. Repository Pattern

```csharp
// File: Repositories/PriorityRepository.cs
using MongoDB.Bson;
using MongoDB.Driver;
using JobLogic.DAL;

namespace JobLogic.Repositories
{
    public interface IPriorityRepository
    {
        Task<Priority> GetByIdAsync(int id);
        Task<List<Priority>> GetAllAsync();
        Task CreateAsync(Priority entity);
        Task<ReplaceOneResult> UpdateAsync(int id, Priority entity);
        Task<DeleteResult> DeleteAsync(int id);
    }

    public class PriorityRepository : BaseRepository<Priority>, IPriorityRepository
    {
        public PriorityRepository(MongoDbContext dbContext)
            : base(dbContext, "Priorities")
        {
        }

        public async Task<Priority> GetByIdAsync(int id)
        {
            var filter = Builders<Priority>.Filter.Eq(p => p.Id, id);
            return await Collection.Find(filter).FirstOrDefaultAsync();
        }

        public async Task<List<Priority>> GetAllAsync()
        {
            return await Collection.Find(FilterDefinition<Priority>.Empty)
                .SortByDescending(p => p.CreatedOn)
                .ToListAsync();
        }

        public async Task CreateAsync(Priority entity)
        {
            await Collection.InsertOneAsync(entity);
        }

        public async Task<ReplaceOneResult> UpdateAsync(int id, Priority entity)
        {
            var filter = Builders<Priority>.Filter.Eq(p => p.Id, id);
            return await Collection.ReplaceOneAsync(filter, entity);
        }

        public async Task<DeleteResult> DeleteAsync(int id)
        {
            var filter = Builders<Priority>.Filter.Eq(p => p.Id, id);
            return await Collection.DeleteOneAsync(filter);
        }
    }
}
```

### 8. JavaScript Handler Pattern

```javascript
// File: wwwroot/js/joblogic/priority/detail.js

(function () {
    'use strict';

    var PriorityDetail = {
        Init: function () {
            this.BindEvents();
            this.LoadFormData();
        },

        BindEvents: function () {
            var self = this;

            // Edit button
            $(document).on('click', '#editBtn', function () {
                self.EnableEdit();
            });

            // Delete button
            $(document).on('click', '#deleteBtn', function () {
                if (confirm('Are you sure you want to delete this priority?')) {
                    self.DeletePriority();
                }
            });

            // Form submission
            $(document).on('submit', '#detailForm', function (e) {
                e.preventDefault();
                self.SavePriority();
            });

            // Cancel edit
            $(document).on('click', '.btn-cancel', function () {
                self.DisableEdit();
                location.reload();
            });
        },

        EnableEdit: function () {
            $('.jl-edit-form').find('input, textarea, select').prop('disabled', false);
            $('.btn-edit').hide();
            $('.btn-save, .btn-cancel').show();
        },

        DisableEdit: function () {
            $('.jl-edit-form').find('input, textarea, select').prop('disabled', true);
            $('.btn-save, .btn-cancel').hide();
            $('.btn-edit').show();
        },

        SavePriority: function () {
            var self = this;
            var formData = $('#detailForm').serialize();

            $.ajax({
                type: 'POST',
                url: '/api/Priority/EditDetail',
                data: $('#detailForm').serialize(),
                dataType: 'json',
                success: function (result) {
                    if (result.success) {
                        $.notification.Success(result.message || 'Priority saved successfully');
                        self.DisableEdit();
                        setTimeout(function () { location.reload(); }, 1500);
                    } else {
                        $.notification.Error(result.message || 'Failed to save priority');
                    }
                },
                error: function (xhr) {
                    $.notification.Error('An error occurred while saving');
                }
            });
        },

        DeletePriority: function () {
            var id = $('[name="Id"]').val();

            $.ajax({
                type: 'POST',
                url: '/api/Priority/DeleteDetail',
                data: { id: id },
                dataType: 'json',
                success: function (result) {
                    if (result.success) {
                        $.notification.Success('Priority deleted successfully');
                        setTimeout(function () { 
                            window.location.href = '/Priority/Index'; 
                        }, 1500);
                    } else {
                        $.notification.Error(result.message || 'Failed to delete priority');
                    }
                },
                error: function () {
                    $.notification.Error('An error occurred');
                }
            });
        },

        LoadFormData: function () {
            // Initialize form with any dynamic data
        }
    };

    // Initialize on document ready
    $(document).ready(function () {
        PriorityDetail.Init();
    });

    // Expose globally if needed
    window.PriorityDetail = PriorityDetail;
})();
```

---

## File Generation Templates

### Template 1: CRUD Feature (Create, Read, Update, Delete)

When adding a new entity/feature, generate these files:

#### **1.1 Controller (MVC)**
```
Controllers/
└── PriorityController.cs
```

#### **1.2 API Controller (for AJAX)**
```
Controllers/Api/
└── PriorityController.cs
```

#### **1.3 ViewModels**
```
Models/Priority/
├── Priority_ViewModel.cs         (main view model)
├── PriorityDetail_ViewModel.cs   (entity fields)
├── PrioritySearch_ViewModel.cs   (search/filter)
└── PrioritySearchItem_ViewModel.cs (list item)
```

#### **1.4 Views (CSHTML)**
```
Views/Priority/
├── Index.cshtml                  (list page)
├── Detail.cshtml                 (detail page)
├── Create.cshtml                 (creation page)
├── Detail/
│   └── _Detail.cshtml            (edit form)
└── _CreateBody.cshtml            (form fields - reused in Create & Edit)
```

#### **1.5 Service (Business Logic)**
```
Services/Tenantless/
└── PriorityService.cs
```

Or for tenant-scoped:
```
Services/Tenancy/
└── PriorityService.cs
```

#### **1.6 Repository (Data Access)**
```
Repositories/
└── PriorityRepository.cs
```

#### **1.7 JavaScript Handler**
```
wwwroot/js/joblogic/priority/
├── detail.js      (detail page interactions)
├── index.js       (list page interactions)
└── handlers.js    (shared handlers)
```

#### **1.8 CSS/SCSS Styling**
```
wwwroot/scss/pages/
└── priority.scss
```

#### **1.9 Bundle Configuration (bundleconfig.json)**
```json
[
  {
    "outputFileName": "wwwroot/js/bundles/priorityDetail.js",
    "inputFiles": [
      "wwwroot/js/joblogic/priority/detail.js",
      "wwwroot/js/joblogic/priority/handlers.js"
    ]
  },
  {
    "outputFileName": "wwwroot/js/bundles/priorityIndex.js",
    "inputFiles": [
      "wwwroot/js/joblogic/priority/index.js"
    ]
  }
]
```

#### **1.10 Bundle Configuration (bundle-config-js.json)**
```json
[
  {
    "outputFileName": "wwwroot/js/bundles/priorityDetail.js",
    "inputFiles": [ "wwwroot/js/joblogic/priority/detail.js" ]
  },
  {
    "outputFileName": "wwwroot/js/bundles/priorityIndex.js",
    "inputFiles": [ "wwwroot/js/joblogic/priority/index.js" ]
  }
]
```

#### **1.11 Enum (Permissions)**
```
Enums/
└── UserPermission.cs (add entries)
```

Example additions:
```csharp
public const string PRIORITY_VIEW = "Priority.View";
public const string PRIORITY_CREATE = "Priority.Create";
public const string PRIORITY_EDIT = "Priority.Edit";
public const string PRIORITY_DELETE = "Priority.Delete";
public const string PRIORITY_EXPORT = "Priority.Export";
```

#### **1.12 Page Configuration (pages-config.yaml)**
```yaml
pages:
  priority:
    name: "Priority"
    description: "Priority Management"
    controller: "priority"
    actions:
      index:
        name: "Priority List"
        action: "index"
        view: "Views/Priority/Index"
        route: "/Priority"
      detail:
        name: "Priority Detail"
        action: "detail"
        view: "Views/Priority/Detail"
        route: "/Priority/Detail/{Id}"
      create:
        name: "Create Priority"
        action: "create"
        view: "Views/Priority/Create"
        route: "/Priority/Create"
```

### Template 2: List/Search Feature Only (No Detail)

Subset of Template 1 for read-only lists:

- Controller (Index only)
- API Controller (Search endpoint)
- Search ViewModel + List Item ViewModel
- Index.cshtml view
- JS handler for list interactions
- CSS styling
- Bundle config

---

## Architecture & Design Patterns

### 1. **Layered Architecture**

```
┌─────────────────────────────────────────┐
│   Presentation Layer (Razor Views)      │
│   - CSHTML + Vue.js components          │
├─────────────────────────────────────────┤
│   API Layer (Controllers)               │
│   - MVC Controllers                     │
│   - RESTful API Controllers             │
├─────────────────────────────────────────┤
│   Business Logic Layer (Services)       │
│   - IPriorityService implementation     │
│   - Domain-specific logic               │
├─────────────────────────────────────────┤
│   Data Access Layer (Repositories)      │
│   - Generic BaseRepository<T>           │
│   - MongoDB queries                     │
├─────────────────────────────────────────┤
│   Domain/Model Layer (POCO Classes)     │
│   - Entity definitions                  │
│   - Validation logic                    │
└─────────────────────────────────────────┘
```

### 2. **Microservices Integration Pattern**

```csharp
// Controller receives request
public async Task<JobLogicJsonResult> EditDetail(PriorityDetail_ViewModel vm)
{
    // 1. Convert ViewModel to Microservice Message
    var msg = new UpdatePriorityMsg
    {
        Id = vm.Id,
        Description = vm.Description
    };

    // 2. Call microservice via injected client
    var response = await _coreServiceClient.RequestAsync(msg);

    // 3. Handle response with TryPick pattern
    if (!response.TryPick(out var result))
        return JsonResultHelper.JsonResultFactoryReturn(response);

    // 4. Return wrapped response to frontend
    return JsonResultHelper.JsonResultFactoryReturn(response);
}

// Microservice contract in __contract/ folder:
// JobLogic.Microservice.Core.Contract/UpdatePriorityMsg.cs
// JobLogic.Microservice.Core.Contract/UpdatePriorityResponse.cs
```

### 3. **Permission-Based Authorization**

```csharp
// 1. Define permissions in UserPermission enum
public const string PRIORITY_VIEW = "Priority.View";
public const string PRIORITY_EDIT = "Priority.Edit";
public const string PRIORITY_DELETE = "Priority.Delete";

// 2. Apply to controller actions via [Permission] attribute
[Permission(UserPermission.PRIORITY_EDIT)]
public async Task<JobLogicJsonResult> EditDetail(...)

// 3. Check in ViewModels for UI rendering
public class Priority_ViewModel
{
    public bool EditPriorityAllowed { get; set; }  // Set in controller
    public bool DeletePriorityAllowed { get; set; }
}

// 4. Use in views for conditional UI
@if (Model.EditPriorityAllowed)
{
    <button id="editBtn">Edit</button>
}
```

### 4. **Dependency Injection**

```csharp
// Program.cs - Service registration
builder.Services.AddScoped<IPriorityService, PriorityService>();
builder.Services.AddScoped<IPriorityRepository, PriorityRepository>();

// Usage in controller
public class PriorityController : BaseJobLogicController
{
    private readonly ICoreServiceClient _coreServiceClient;

    public PriorityController(
        IScsAuthentication scsAuthentication,
        ILogger<PriorityController> logger,
        ICoreServiceClient coreServiceClient)
        : base(scsAuthentication, logger, coreServiceClient)
    {
        _coreServiceClient = coreServiceClient;
    }
}
```

### 5. **Validation Pattern**

```csharp
// Server-side: Data Annotations
[Required(ErrorMessage = "Description is required")]
[StringLength(128, ErrorMessage = "...")]
[Range(0, int.MaxValue)]
public string Description { get; set; }

// Client-side: jQuery Validation (automatic from data annotations)
// JavaScript: Custom validation rules

// API: Returns ModelState errors
if (!ModelState.IsValid)
    return JsonResultHelper.Invalid(ModelState);
```

### 6. **Response Wrapping Pattern**

```csharp
// All API responses wrapped in JobLogicJsonResult
return JsonResultHelper.JsonResultFactoryReturn(
    response: microserviceResponse,
    SuccessMessage: "Operation completed",
    ErrorMessage: "Operation failed");

// Response structure:
// {
//   "success": true/false,
//   "message": "...",
//   "data": { ... },
//   "errors": [ ... ]
// }
```

### 7. **View Composition Pattern**

```
Detail View (main container)
    ├─ Partial Form (_Detail.cshtml)
    │   ├─ _CreateBody.cshtml (reusable fields)
    │   └─ Hidden fields
    └─ JavaScript bundle (ppmPriorityDetail.js)
        ├─ detail.js (page logic)
        └─ handlers.js (shared handlers)
```

---

## Configuration Reference

### 1. **bundleconfig.json**

Defines JavaScript and CSS bundles for production minification:

```json
[
  {
    "outputFileName": "wwwroot/js/bundles/joblogicutils.js",
    "inputFiles": [
      "wwwroot/js/joblogic/jquery.validate.hooks.js",
      "wwwroot/js/joblogic/jl-antiforgery.js"
    ]
  }
]
```

### 2. **bundle-config-js.json**

Page-specific JavaScript bundles:

```json
[
  {
    "outputFileName": "wwwroot/js/bundles/priorityDetail.js",
    "inputFiles": [
      "wwwroot/js/joblogic/priority/detail.js"
    ]
  }
]
```

### 3. **bundle-config-css.json**

CSS/SCSS bundles:

```json
[
  {
    "outputFileName": "wwwroot/css/bundles/priority.css",
    "inputFiles": [
      "wwwroot/scss/pages/priority.scss"
    ]
  }
]
```

### 4. **pages-config.yaml**

Documents pages, routes, and permissions:

```yaml
pages:
  priority:
    name: "Priority"
    description: "Priority Management"
    controller: "priority"
    module: "ppm"
    actions:
      index:
        name: "Priority List"
        action: "index"
        route: "/Priority"
        permissions:
          - "Priority.View"
      detail:
        name: "Priority Detail"
        action: "detail"
        route: "/Priority/Detail/{Id}"
        permissions:
          - "Priority.View"
          - "Priority.Edit"
```

### 5. **Appsettings.json**

Database, logging, and feature configurations:

```json
{
  "MongoDb": {
    "ConnectionString": "mongodb://...",
    "DatabaseName": "joblogic_db"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft": "Warning"
    }
  },
  "Features": {
    "EnableExport": true,
    "MaxPageSize": 1000
  }
}
```

---

## Common Workflows

### Workflow 1: Add a New CRUD Module

**Step-by-step process:**

1. **Create Enum Entries** (Enums/UserPermission.cs)
   ```csharp
   public const string PRIORITY_VIEW = "Priority.View";
   public const string PRIORITY_CREATE = "Priority.Create";
   public const string PRIORITY_EDIT = "Priority.Edit";
   public const string PRIORITY_DELETE = "Priority.Delete";
   ```

2. **Create ViewModels**
   - `Models/Priority/Priority_ViewModel.cs`
   - `Models/Priority/PriorityDetail_ViewModel.cs`
   - `Models/Priority/PrioritySearch_ViewModel.cs`
   - `Models/Priority/PrioritySearchItem_ViewModel.cs`

3. **Create Controllers**
   - `Controllers/PriorityController.cs` (MVC)
   - `Controllers/Api/PriorityController.cs` (API)

4. **Create Views**
   - `Views/Priority/Index.cshtml`
   - `Views/Priority/Detail.cshtml`
   - `Views/Priority/Create.cshtml`
   - `Views/Priority/Detail/_Detail.cshtml`
   - `Views/Priority/_CreateBody.cshtml`

5. **Create JavaScript Files**
   - `wwwroot/js/joblogic/priority/detail.js`
   - `wwwroot/js/joblogic/priority/index.js`
   - `wwwroot/js/joblogic/priority/handlers.js`

6. **Add CSS/SCSS**
   - `wwwroot/scss/pages/priority.scss`

7. **Update Bundle Configs**
   - Add entries to `bundleconfig.json`
   - Add entries to `bundle-config-js.json`
   - Add entries to `bundle-config-css.json`

8. **Add Page Config**
   - Update `pages-config.yaml` with new page routes

9. **Create Service (Optional)**
   - `Services/Tenantless/PriorityService.cs`

10. **Create Repository (Optional)**
    - `Repositories/PriorityRepository.cs`

### Workflow 2: Modify an Existing Feature

1. Update ViewModel properties
2. Update Controller actions
3. Update View HTML/bindings
4. Update JavaScript logic
5. Add validation as needed
6. Test form submission and AJAX calls

### Workflow 3: Add Permission Check

1. Define permission constant in `UserPermission.cs`
2. Add `[Permission(UserPermission.FEATURE_ACTION)]` to controller action
3. Set permission flag in ViewModel from controller
4. Use permission flag in view for conditional UI rendering

---

## Best Practices

### 1. **Always Use Permissions**
- Define permissions in `UserPermission.cs`
- Apply `[Permission]` attribute to all sensitive actions
- Set permission flags in ViewModels
- Check permissions in views before rendering sensitive UI

### 2. **Validation Strategy**
- Use data annotations for basic validation
- Implement server-side validation for business rules
- Return validation errors in `JobLogicJsonResult`
- Display errors in modal or alert

### 3. **Error Handling**
```csharp
try
{
    // Database/service call
}
catch (Exception ex)
{
    _logger.LogError(ex, "Operation failed");
    return JsonResultHelper.JsonResultFactoryReturn(
        OperationStatus.Error, 
        "An error occurred");
}
```

### 4. **Navigation & Breadcrumbs**
- Always include breadcrumb navigation in views
- Link back to list/parent pages
- Use consistent URL patterns: `/Module/Action` or `/Module/Action/{Id}`

### 5. **Search/Filter State**
- Persist filter preferences in LocalStorage
- Use `BaseSearchViewModel` as base class
- Implement `restoreLocalStorageFilter()` on page load

### 6. **API Naming**
- Use POST for data modifications (security)
- Use GET for read operations
- Route: `/api/[controller]/[action]`
- Example: `/api/Priority/Search`, `/api/Priority/EditDetail`

### 7. **Component Reusability**
- Extract common form fields to `_CreateBody.cshtml`
- Share partials between Create and Edit views
- Use `<partial>` tag with model binding
- Keep JS logic modular and reusable

### 8. **Testing Considerations**
- Keep controllers thin (delegate to services)
- Test business logic in services/repositories
- Mock microservice clients in unit tests
- Test permission checks with different user roles

---

## Quick Reference Checklist

### New Simple Feature (List Only)
- [ ] API Controller with Search method
- [ ] Search ViewModel + Item ViewModel
- [ ] Index.cshtml view with jl-table
- [ ] JavaScript handler (`index.js`)
- [ ] CSS styling
- [ ] bundleconfig.json entry
- [ ] pages-config.yaml entry

### New CRUD Feature (Full)
- [ ] Controllers (MVC + API)
- [ ] 4 ViewModels (Parent, Detail, Search, SearchItem)
- [ ] 5+ Views (Index, Detail, Create, Partials)
- [ ] Service class (if complex logic)
- [ ] Repository class (if custom queries)
- [ ] 2-3 JavaScript files
- [ ] CSS/SCSS file
- [ ] Bundle configs (JS + CSS)
- [ ] pages-config.yaml
- [ ] UserPermission constants (4-5)

---

## File Locations Quick Lookup

| **File Type** | **Location** | **Example** |
|---------------|------------|-----------|
| Controller | `Controllers/` | `Controllers/PriorityController.cs` |
| API Controller | `Controllers/Api/` | `Controllers/Api/PriorityController.cs` |
| ViewModel | `Models/{Entity}/` | `Models/Priority/Priority_ViewModel.cs` |
| View (CSHTML) | `Views/{Module}/` | `Views/Priority/Index.cshtml` |
| Partial View | `Views/{Module}/{Feature}/` | `Views/Priority/Detail/_Detail.cshtml` |
| Service | `Services/Tenantless/` or `Services/Tenancy/` | `Services/Tenantless/PriorityService.cs` |
| Repository | `Repositories/` | `Repositories/PriorityRepository.cs` |
| JavaScript | `wwwroot/js/joblogic/{module}/` | `wwwroot/js/joblogic/priority/detail.js` |
| CSS/SCSS | `wwwroot/scss/pages/` | `wwwroot/scss/pages/priority.scss` |
| Enum | `Enums/` | `Enums/UserPermission.cs` |
| Attribute | `Attributes/` | `Attributes/PermissionAttribute.cs` |
| Helper | `Helpers/` | `Helpers/IdentityHelper.cs` |

---

## Related Documentation

- **User Memory**: `JobLogic_Patterns.md` - Additional frontend patterns
- **Repository Memory**: Frontend configuration, project structure
- **Microservice Contracts**: Located in `__contract/` folders
- **Module Configuration**: `pages-config.yaml`

---

**Last Updated**: 2026-04-09  
**Document Version**: 1.0  
**Target Framework**: ASP.NET Core 6+

## Tech Stack
Framework: **Vue2**


## Framework
Apply the design memory to whichever UI framework the project uses (React, Vue, Svelte, Angular, plain HTML/CSS, etc.).
Adapt component names, styling conventions, and routing to the target framework while strictly following the values defined in the session JSON layers.

