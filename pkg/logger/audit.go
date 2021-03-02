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

package logger

import (
	"bytes"

	"github.com/pingcap/tiup/pkg/cluster/audit"
	utils2 "github.com/pingcap/tiup/pkg/utils"
	"go.uber.org/atomic"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var auditEnabled atomic.Bool
var auditBuffer *bytes.Buffer
var auditDir string

// EnableAuditLog enables audit log.
func EnableAuditLog(dir string) {
	auditDir = dir
	auditEnabled.Store(true)
}

// DisableAuditLog disables audit log.
func DisableAuditLog() {
	auditEnabled.Store(false)
}

func newAuditLogCore() zapcore.Core {
	auditBuffer = bytes.NewBuffer([]byte{})
	encoder := zapcore.NewConsoleEncoder(zap.NewDevelopmentEncoderConfig())
	return zapcore.NewCore(encoder, zapcore.Lock(zapcore.AddSync(auditBuffer)), zapcore.DebugLevel)
}

// AddCustomAuditLog adds a custom audit log
func AddCustomAuditLog(log string) {
	auditBuffer.Reset()
	auditBuffer.WriteString(log + "\n")
	_ = OutputAuditLogIfEnabled()
}

// OutputAuditLogIfEnabled outputs audit log if enabled.
func OutputAuditLogIfEnabled() error {
	if !auditEnabled.Load() {
		return nil
	}

	if err := utils2.CreateDir(auditDir); err != nil {
		return err
	}

	err := audit.OutputAuditLog(auditDir, auditBuffer.Bytes())
	if err != nil {
		return err
	}
	auditBuffer.Reset()

	return nil
}
