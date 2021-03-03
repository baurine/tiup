// Copyright 2020 PingCAP, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// See the License for the specific language governing permissions and
// limitations under the License.

package cmd

import (
	"fmt"
	"sort"
	"strings"

	"github.com/pingcap/errors"
	"github.com/pingcap/tiup/pkg/environment"
	"github.com/pingcap/tiup/pkg/repository/v1manifest"
	"github.com/pingcap/tiup/pkg/set"
	"github.com/pingcap/tiup/pkg/tui"
	"github.com/pingcap/tiup/pkg/version"
	"github.com/spf13/cobra"
	"golang.org/x/mod/semver"
)

// ListOptions represents the command options for `tiup list` command
type ListOptions struct {
	installedOnly bool
	verbose       bool
	showAll       bool
}

func newListCmd() *cobra.Command {
	var opt ListOptions
	cmd := &cobra.Command{
		Use:   "list [component]",
		Short: "List the available TiDB components or versions",
		Long: `List the available TiDB components if you don't specify any component name,
or list the available versions of a specific component. Display a list of
local caches by default. Use the --installed flag to hide
components or versions which have not been installed.

  # List all installed components
  tiup list --installed

  # List all installed versions of TiDB
  tiup list tidb --installed`,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			env := environment.GlobalEnv()
			switch len(args) {
			case 0:
				result, err := showComponentList(env, opt)
				result.print()
				return err
			case 1:
				result, err := ShowComponentVersions(env, args[0], opt)
				result.print()
				return err
			default:
				return cmd.Help()
			}
		},
	}

	cmd.Flags().BoolVar(&opt.installedOnly, "installed", false, "List installed components only.")
	cmd.Flags().BoolVar(&opt.verbose, "verbose", false, "Show detailed component information.")
	cmd.Flags().BoolVar(&opt.showAll, "all", false, "Show all components include hidden ones.")

	return cmd
}

// ListResult represents the result of `tiup list` command
type ListResult struct {
	header   string
	CmpTable [][]string
}

func (lr *ListResult) print() {
	if lr == nil {
		return
	}
	fmt.Printf(lr.header)
	tui.PrintTable(lr.CmpTable, true)
}

func showComponentList(env *environment.Environment, opt ListOptions) (*ListResult, error) {
	err := env.V1Repository().UpdateComponentManifests()
	if err != nil {
		return nil, err
	}

	installed, err := env.Profile().InstalledComponents()
	if err != nil {
		return nil, err
	}

	var cmpTable [][]string
	if opt.verbose {
		cmpTable = append(cmpTable, []string{"Name", "Owner", "Installed", "Platforms", "Description"})
	} else {
		cmpTable = append(cmpTable, []string{"Name", "Owner", "Description"})
	}

	index := v1manifest.Index{}
	_, exists, err := env.V1Repository().Local().LoadManifest(&index)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, errors.Errorf("unreachable: index.json not found in manifests directory")
	}

	localComponents := set.NewStringSet(installed...)
	compIDs := []string{}
	components := index.ComponentList()
	for id := range components {
		compIDs = append(compIDs, id)
	}
	sort.Strings(compIDs)
	for _, id := range compIDs {
		comp := components[id]
		if opt.installedOnly && !localComponents.Exist(id) {
			continue
		}

		if (!opt.installedOnly && !opt.showAll) && comp.Hidden {
			continue
		}

		filename := v1manifest.ComponentManifestFilename(id)
		manifest, err := env.V1Repository().Local().LoadComponentManifest(&comp, filename)
		if err != nil {
			return nil, err
		}

		if manifest == nil {
			continue
		}

		if opt.verbose {
			installStatus := ""
			if localComponents.Exist(id) {
				versions, err := env.Profile().InstalledVersions(id)
				if err != nil {
					return nil, err
				}
				installStatus = strings.Join(versions, ",")
			}

			var platforms []string
			for p := range manifest.Platforms {
				platforms = append(platforms, p)
			}
			cmpTable = append(cmpTable, []string{
				id,
				comp.Owner,
				installStatus,
				strings.Join(platforms, ","),
				manifest.Description,
			})
		} else {
			cmpTable = append(cmpTable, []string{
				id,
				comp.Owner,
				manifest.Description,
			})
		}
	}

	return &ListResult{
		header:   "Available components:\n",
		CmpTable: cmpTable,
	}, nil
}

// should move to pkg folder

// ShowComponentVersions shows all versions of a certain component
func ShowComponentVersions(env *environment.Environment, component string, opt ListOptions) (*ListResult, error) {
	var comp *v1manifest.Component
	var err error
	comp, err = env.V1Repository().FetchComponentManifest(component, false)
	if err != nil {
		return nil, errors.Annotate(err, "failed to fetch component")
	}

	versions, err := env.Profile().InstalledVersions(component)
	if err != nil {
		return nil, err
	}
	installed := set.NewStringSet(versions...)

	var cmpTable [][]string
	cmpTable = append(cmpTable, []string{"Version", "Installed", "Release", "Platforms"})

	platforms := make(map[string][]string)
	released := make(map[string]string)

	for plat := range comp.Platforms {
		versions := comp.VersionList(plat)
		for ver, verinfo := range versions {
			if ver == comp.Nightly {
				key := fmt.Sprintf("%s -> %s", version.NightlyVersion, comp.Nightly)
				platforms[key] = append(platforms[key], plat)
				released[key] = verinfo.Released
			}
			platforms[ver] = append(platforms[ver], plat)
			released[ver] = verinfo.Released
		}
	}
	verList := []string{}
	for v := range platforms {
		verList = append(verList, v)
	}
	sort.Slice(verList, func(p, q int) bool {
		return semver.Compare(verList[p], verList[q]) < 0
	})

	for _, v := range verList {
		installStatus := ""
		if installed.Exist(v) {
			installStatus = "YES"
		} else if opt.installedOnly {
			continue
		}
		cmpTable = append(cmpTable, []string{v, installStatus, released[v], strings.Join(platforms[v], ",")})
	}

	return &ListResult{
		header:   fmt.Sprintf("Available versions for %s:\n", component),
		CmpTable: cmpTable,
	}, nil
}
