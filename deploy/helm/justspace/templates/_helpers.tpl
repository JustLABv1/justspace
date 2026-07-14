{{- define "justspace.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "justspace.fullname" -}}
{{- if .Values.fullnameOverride }}{{ .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}{{ else }}{{ printf "%s-%s" .Release.Name (include "justspace.name" .) | trunc 63 | trimSuffix "-" }}{{ end }}
{{- end }}

{{- define "justspace.labels" -}}
app.kubernetes.io/name: {{ include "justspace.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- with .Values.global.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{- define "justspace.selectorLabels" -}}
app.kubernetes.io/name: {{ include "justspace.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "justspace.frontendImage" -}}
{{- if .Values.frontend.image.digest -}}
{{ printf "%s@%s" .Values.frontend.image.repository .Values.frontend.image.digest }}
{{- else -}}
{{- printf "%s:%s" .Values.frontend.image.repository (required "frontend.image.tag is required when digest is not set" .Values.frontend.image.tag) -}}
{{- end -}}
{{- end }}

{{- define "justspace.backendImage" -}}
{{- if .Values.backend.image.digest -}}
{{ printf "%s@%s" .Values.backend.image.repository .Values.backend.image.digest }}
{{- else -}}
{{- printf "%s:%s" .Values.backend.image.repository (required "backend.image.tag is required when digest is not set" .Values.backend.image.tag) -}}
{{- end -}}
{{- end }}

{{- define "justspace.backendServiceName" -}}{{ include "justspace.fullname" . }}-backend{{- end }}
{{- define "justspace.frontendServiceName" -}}{{ include "justspace.fullname" . }}-frontend{{- end }}
{{- define "justspace.storageClaim" -}}
{{- if .Values.backend.persistence.existingClaim }}{{ .Values.backend.persistence.existingClaim }}{{ else }}{{ include "justspace.fullname" . }}-uploads{{ end -}}
{{- end }}
{{- define "justspace.databaseHost" -}}
{{- if .Values.postgresql.enabled }}{{ printf "%s-postgresql" .Release.Name }}{{ else }}{{ .Values.backend.externalDatabase.host }}{{ end -}}
{{- end }}
{{- define "justspace.databaseSecretName" -}}
{{- if .Values.postgresql.enabled }}{{ .Values.postgresql.auth.existingSecret }}{{ else }}{{ .Values.backend.externalDatabase.existingSecret.name }}{{ end -}}
{{- end }}
{{- define "justspace.databasePasswordKey" -}}
{{- if .Values.postgresql.enabled }}{{ .Values.postgresql.auth.secretKeys.userPasswordKey }}{{ else }}{{ .Values.backend.externalDatabase.existingSecret.passwordKey }}{{ end -}}
{{- end }}
{{- define "justspace.databaseName" -}}
{{- if .Values.postgresql.enabled }}{{ .Values.postgresql.auth.database }}{{ else }}{{ .Values.backend.externalDatabase.database }}{{ end -}}
{{- end }}
{{- define "justspace.databaseUser" -}}
{{- if .Values.postgresql.enabled }}{{ .Values.postgresql.auth.username }}{{ else }}{{ .Values.backend.externalDatabase.user }}{{ end -}}
{{- end }}
{{- define "justspace.apiUrl" -}}{{ default .Values.global.publicUrl .Values.frontend.apiUrl | trimSuffix "/" }}{{- end }}
{{- define "justspace.wsUrl" -}}
{{- if .Values.frontend.wsUrl }}{{ .Values.frontend.wsUrl | trimSuffix "/" }}{{ else }}{{ .Values.global.publicUrl | replace "https://" "wss://" | replace "http://" "ws://" | trimSuffix "/" }}{{ end -}}
{{- end }}

{{- define "justspace.customCAVolume" -}}
{{- if .Values.customCA.enabled }}
- name: custom-ca
  {{- if .Values.customCA.existingConfigMap }}
  configMap:
    name: {{ .Values.customCA.existingConfigMap }}
    items:
      - key: {{ .Values.customCA.key }}
        path: custom-ca.pem
  {{- else }}
  secret:
    secretName: {{ .Values.customCA.existingSecret }}
    items:
      - key: {{ .Values.customCA.key }}
        path: custom-ca.pem
  {{- end }}
{{- end }}
{{- end }}

{{- define "justspace.customCAMount" -}}
{{- if .Values.customCA.enabled }}
- name: custom-ca
  mountPath: /etc/justspace-ca
  readOnly: true
{{- end }}
{{- end }}

{{- define "justspace.validate" -}}
{{- $publicURL := required "global.publicUrl is required" .Values.global.publicUrl -}}
{{- if not (hasPrefix "https://" $publicURL) }}{{ fail "global.publicUrl must use https://" }}{{ end -}}
{{- if ne (int .Values.backend.replicaCount) 1 }}{{ fail "backend.replicaCount must be exactly 1 until realtime events are distributed" }}{{ end -}}
{{- $ignored := required "backend.existingSecret.name is required" .Values.backend.existingSecret.name -}}
{{- if .Values.postgresql.enabled -}}
{{- $ignored = required "postgresql.auth.existingSecret is required when postgresql.enabled=true" .Values.postgresql.auth.existingSecret -}}
{{- $ignored = required "postgresql.tls.certificatesSecret is required when postgresql.enabled=true" .Values.postgresql.tls.certificatesSecret -}}
{{- if not .Values.postgresql.tls.enabled }}{{ fail "postgresql.tls.enabled must be true in this chart" }}{{ end -}}
{{- if not .Values.customCA.enabled }}{{ fail "customCA.enabled must be true when postgresql.enabled=true so the backend can verify PostgreSQL TLS" }}{{ end -}}
{{- else -}}
{{- $ignored = required "backend.externalDatabase.host is required" .Values.backend.externalDatabase.host -}}
{{- $ignored = required "backend.externalDatabase.existingSecret.name is required" .Values.backend.externalDatabase.existingSecret.name -}}
{{- end -}}
{{- if and (not .Values.backend.persistence.enabled) (not .Values.backend.persistence.existingClaim) }}{{ fail "enable backend.persistence or set backend.persistence.existingClaim" }}{{ end -}}
{{- if .Values.customCA.enabled -}}
{{- if and .Values.customCA.existingConfigMap .Values.customCA.existingSecret }}{{ fail "set only one customCA source" }}{{ end -}}
{{- if not (or .Values.customCA.existingConfigMap .Values.customCA.existingSecret) }}{{ fail "set a customCA ConfigMap or Secret when customCA.enabled=true" }}{{ end -}}
{{- end -}}
{{- if .Values.ingress.enabled -}}
{{- $ignored = required "ingress.host is required when ingress.enabled=true" .Values.ingress.host -}}
{{- if .Values.ingress.tls.enabled }}{{- $ignored = required "ingress.tls.existingSecret is required when ingress TLS is enabled" .Values.ingress.tls.existingSecret -}}{{ end -}}
{{- end -}}
{{- end }}
