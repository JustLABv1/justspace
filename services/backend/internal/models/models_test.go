package models

import (
	"encoding/json"
	"testing"
)

func TestUpdateWorkspaceRequestAutoAddMembersToProjects(t *testing.T) {
	tests := []struct {
		name    string
		payload string
		want    *bool
	}{
		{name: "enabled", payload: `{"autoAddMembersToProjects":true}`, want: boolPtr(true)},
		{name: "disabled", payload: `{"autoAddMembersToProjects":false}`, want: boolPtr(false)},
		{name: "omitted", payload: `{}`, want: nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var request UpdateWorkspaceRequest
			if err := json.Unmarshal([]byte(tt.payload), &request); err != nil {
				t.Fatalf("unmarshal request: %v", err)
			}

			if tt.want == nil {
				if request.AutoAddMembersToProjects != nil {
					t.Fatalf("autoAddMembersToProjects = %v, want nil", *request.AutoAddMembersToProjects)
				}
				return
			}

			if request.AutoAddMembersToProjects == nil {
				t.Fatal("autoAddMembersToProjects = nil, want a value")
			}
			if *request.AutoAddMembersToProjects != *tt.want {
				t.Fatalf("autoAddMembersToProjects = %v, want %v", *request.AutoAddMembersToProjects, *tt.want)
			}
		})
	}
}

func boolPtr(value bool) *bool {
	return &value
}
