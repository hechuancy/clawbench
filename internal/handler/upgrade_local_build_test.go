package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"clawbench/internal/model"
	"clawbench/internal/service"
	"clawbench/internal/version"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

// ServeUpgradeCheck must report no upgrade for a local build. The service
// short-circuit marks its response SkippedRegistry; the handler's dev-build
// clause (meant for OFFICIAL dev builds) must not resurrect an upgrade offer
// from a response that never consulted the registry.
func TestServeUpgradeCheck_LocalBuildReportsNoUpgrade(t *testing.T) {
	defer func() {
		upgradeCheckForUpgradeInfo = service.CheckForUpgradeInfo
		upgradeCompareVersions = version.CompareVersions
		upgradeIsDevBuild = version.IsDevBuild
		upgradeCheckInstallDirWrit = service.CheckInstallDirWritable
		upgradeIsDocker = service.IsDocker
	}()

	// Same shape the service short-circuit returns, plus SkippedRegistry.
	upgradeCheckForUpgradeInfo = func() (*service.UpgradeInfo, error) {
		return &service.UpgradeInfo{
			CurrentVersion:  "v0.138.0-3-gabc1234-dev",
			LatestVersion:   "v0.138.0-3-gabc1234-dev",
			SkippedRegistry: true,
		}, nil
	}
	upgradeCompareVersions = version.CompareVersions
	// The running binary IS a dev build — exactly the production situation the
	// guard must survive: the dev clause alone would report has_upgrade=true.
	upgradeIsDevBuild = func(string) bool { return true }
	upgradeCheckInstallDirWrit = func() (string, error) { return "/usr/local/bin", nil }
	upgradeIsDocker = func() bool { return false }

	req := newRequest(t, http.MethodGet, "/api/upgrade/check", nil)
	withAuthCookie(req, model.SessionToken)
	w := callHandler(ServeUpgradeCheck, req)

	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Equal(t, false, resp["has_upgrade"], "a local build must never be offered an upgrade")
}
