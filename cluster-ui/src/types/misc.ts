export type OperationType =
  | 'deploy'
  | 'start'
  | 'stop'
  | 'scaleIn'
  | 'scaleOut'
  | 'destroy'

export interface IOperationStatus {
  operation_type: OperationType
  cluster_name: string
  total_progress: number
  steps: string[]
  err_msg: string
}

export interface ICluster {
  name: string
  user: string
  version: string
  path: string
  private_key: string
}

export interface IClusterInstInfo {
  id: string
  role: string
  host: string
  ports: string
  os_arch: string
  status: string
  data_dir: string
  deploy_dir: string
}