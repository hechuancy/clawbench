package handler

import (
	"net/http"
	"testing"

	"clawbench/internal/model"
	"clawbench/internal/service"
	"clawbench/internal/version"

	"github.com/stretchr/testify/assert"
)

// Local-branch builds must never be replaced by the official npm package.
// ServeUpgradeStart refuses with 403 before touching the upgrade machinery,
// so even a stale UI (or a direct API call) cannot discard local changes.

func TestServeUpgradeStart_RefusedOnLocalBuild(t *testing.T) {
	defer func() {
		upgradeIsDevBuild = version.IsDevBuild
		upgradeIsInProgress = service.IsUpgradeInProgress
		upgradePerformUpgrade = service.PerformUpgrade
	}()

	upgradeIsDevBuild = func(string) bool { return true }
	upgradeIsInProgress = func() bool { return false }
	upgradeCalled := false
	upgradePerformUpgrade = func(string) { upgradeCalled = true }

	req := newRequest(t, http.MethodPost, "/api/upgrade/start", nil)
	withAuthCookie(req, model.SessionToken)
	w := callHandler(ServeUpgradeStart, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
	assert.False(t, upgradeCalled, "PerformUpgrade must not run on a local build")
}
