package service

import (
	"testing"

	"clawbench/internal/version"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Local-branch builds carry a pre-release/dev suffix. fetchUpgradeInfo must
// short-circuit on them: report "already latest" without querying any registry,
// so the UI never offers to replace this build with the official npm package.

func TestFetchUpgradeInfo_LocalBuildShortCircuits(t *testing.T) {
	orig := version.Version
	version.Version = "v0.138.0-257-g412c16a7-1111"
	defer func() { version.Version = orig }()

	info, err := fetchUpgradeInfo()

	require.NoError(t, err, "a local build must not reach the registry at all")
	require.NotNil(t, info)
	assert.False(t, info.HasUpgrade, "a local build must never report an upgrade")
	assert.Equal(t, version.Get(), info.CurrentVersion)
	assert.Equal(t, version.Get(), info.LatestVersion, "latest must mirror current so the UI shows 'already latest'")
}
