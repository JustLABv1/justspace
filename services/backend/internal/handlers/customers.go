package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/models"
	"github.com/justlabv1/justspace/backend/internal/repository"
)

type CustomerHandler struct{ repo *repository.Repo }

func NewCustomerHandler(repo *repository.Repo) *CustomerHandler { return &CustomerHandler{repo: repo} }

func (h *CustomerHandler) ensureConsulting(w http.ResponseWriter, r *http.Request, workspaceID, userID string, roles ...string) bool {
	if len(roles) > 0 && !ensureWorkspaceRole(w, r, h.repo, workspaceID, userID, roles...) {
		return false
	}
	if len(roles) == 0 && !ensureWorkspaceAccess(w, r, h.repo, workspaceID, userID) {
		return false
	}
	consulting, err := h.repo.IsConsultingWorkspace(r.Context(), workspaceID)
	if err != nil || !consulting {
		writeError(w, http.StatusForbidden, "customers are available in consulting workspaces only")
		return false
	}
	return true
}

func (h *CustomerHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, userID := chi.URLParam(r, "workspaceId"), middleware.GetUserID(r)
	if !h.ensureConsulting(w, r, workspaceID, userID) {
		return
	}
	customers, err := h.repo.ListCustomers(r.Context(), workspaceID, r.URL.Query().Get("archived") == "true")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list customers")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.Customer]{Total: len(customers), Documents: customers})
}

func (h *CustomerHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, userID := chi.URLParam(r, "workspaceId"), middleware.GetUserID(r)
	if !h.ensureConsulting(w, r, workspaceID, userID, "owner", "admin") {
		return
	}
	var req models.CreateCustomerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	customer, err := h.repo.CreateCustomer(r.Context(), workspaceID, req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, customer)
}

func (h *CustomerHandler) Update(w http.ResponseWriter, r *http.Request) {
	workspaceID, userID := chi.URLParam(r, "workspaceId"), middleware.GetUserID(r)
	if !h.ensureConsulting(w, r, workspaceID, userID, "owner", "admin") {
		return
	}
	var req models.UpdateCustomerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	customer, err := h.repo.UpdateCustomer(r.Context(), chi.URLParam(r, "customerId"), workspaceID, req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to update customer")
		return
	}
	writeJSON(w, http.StatusOK, customer)
}

func (h *CustomerHandler) ListAllocations(w http.ResponseWriter, r *http.Request) {
	projectID, userID := chi.URLParam(r, "projectId"), middleware.GetUserID(r)
	if !ensureProjectAccess(w, r, h.repo, projectID, userID) {
		return
	}
	allocations, err := h.repo.ListProjectAllocations(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list allocations")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.ProjectMemberAllocation]{Total: len(allocations), Documents: allocations})
}

func (h *CustomerHandler) UpsertAllocation(w http.ResponseWriter, r *http.Request) {
	projectID, userID := chi.URLParam(r, "projectId"), middleware.GetUserID(r)
	if !ensureProjectRole(w, r, h.repo, projectID, userID, "owner", "admin") {
		return
	}
	var req models.UpsertProjectMemberAllocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.DaysPerWeek < 0 {
		writeError(w, http.StatusBadRequest, "a non-negative allocation is required")
		return
	}
	allocation, err := h.repo.UpsertProjectAllocation(r.Context(), projectID, chi.URLParam(r, "userId"), req.DaysPerWeek)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to update allocation")
		return
	}
	writeJSON(w, http.StatusOK, allocation)
}
