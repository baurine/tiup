import React, { useCallback, useState } from 'react'
import { useLocalStorageState } from 'ahooks'
import { Drawer, Button, Modal, Form, Input, Select } from 'antd'
import uniqid from 'uniqid'
import yaml from 'yaml'

import { IMachine } from '../Machines/MachineForm'
import DeploymentTable, {
  IComponent,
  COMPONENT_TYPES,
  DEF_TIDB_PORT,
  DEF_TIDB_STATUS_PORT,
  DEF_TIKV_PORT,
  DEF_TIKV_STATUS_PORT,
  DEF_TIFLASH_TCP_PORT,
  DEF_TIFLASH_HTTP_PORT,
  DEF_TIFLASH_SERVICE_PORT,
  DEF_TIFLASH_PROXY_PORT,
  DEF_TIFLASH_PROXY_STATUS_PORT,
  DEF_TIFLASH_METRICS_PORT,
  DEF_PD_PEER_PORT,
  DEF_PROM_PORT,
  DEF_GRAFANA_PORT,
  DEF_ALERT_CLUSTER_PORT,
  DEF_PD_CLIENT_PORT,
  DEF_ALERT_WEB_PORT,
} from './DeploymentTable'
import EditCompForm from './EditCompForm'
import TopoPreview, { genTopo } from './TopoPreview'
import { Root } from '../../components/Root'
import { deployCluster, scaleOutCluster } from '../../utils/api'
import { IGlobalLoginOptions } from '../Machines/GlobalLoginOptionsForm'
import { useNavigate } from 'react-router-dom'

// TODO: fetch from API
const TIDB_VERSIONS = [
  'v4.0.4',
  'v4.0.3',
  'v4.0.2',
  'v4.0.1',
  'v4.0.0',
  'v3.1.2',
  'v3.1.1',
  'v3.1.0',
]

export interface IDeployReq {
  cluster_name: string
  tidb_version: string
}

export interface ICompsManagerProps {
  clusterName?: string
  forScaleOut: boolean
}

export default function CompsManager({
  clusterName,
  forScaleOut,
}: ICompsManagerProps) {
  const [machines] = useLocalStorageState<{
    [key: string]: IMachine
  }>('machines', {})
  const [components, setComponents] = useLocalStorageState<{
    [key: string]: IComponent
  }>('components', {})
  const [curComp, setCurComp] = useState<IComponent | undefined>(undefined)

  const [previewYaml, setPreviewYaml] = useState(false)

  const [deployReq, setDeployReq] = useLocalStorageState<IDeployReq>(
    'deploy_req',
    { cluster_name: '', tidb_version: '' }
  )

  const [globalLoginOptions] = useLocalStorageState<IGlobalLoginOptions>(
    'global_login_options',
    {}
  )

  const [, setCurScaleOutNodes] = useLocalStorageState(
    'cur_scale_out_nodes',
    {}
  )

  const navigate = useNavigate()

  const [form] = Form.useForm()

  const handleAddComponent = useCallback(
    (machine: IMachine, componentType: string, forScaleOut: boolean) => {
      let comp: IComponent = {
        id: uniqid(),
        machineID: machine.id,
        type: componentType,
        for_scale_out: forScaleOut,
        priority: COMPONENT_TYPES.indexOf(componentType),
      }
      const existedSameComps = Object.values(components).filter(
        (comp) => comp.type === componentType && comp.machineID === machine.id
      )
      if (existedSameComps.length > 0) {
        const lastComp = existedSameComps[existedSameComps.length - 1] as any
        comp.deploy_dir_prefix = lastComp.deploy_dir_prefix
        comp.data_dir_prefix = lastComp.data_dir_prefix
        let newComp = comp as any
        switch (componentType) {
          case 'TiDB':
            newComp.port = (lastComp.port || DEF_TIDB_PORT) + 1
            newComp.status_port =
              (lastComp.status_port || DEF_TIDB_STATUS_PORT) + 1
            break
          case 'TiKV':
            newComp.port = (lastComp.port || DEF_TIKV_PORT) + 1
            newComp.status_port =
              (lastComp.status_port || DEF_TIKV_STATUS_PORT) + 1
            break
          case 'TiFlash':
            newComp.tcp_port = (lastComp.tcp_port || DEF_TIFLASH_TCP_PORT) + 1
            newComp.http_port =
              (lastComp.http_port || DEF_TIFLASH_HTTP_PORT) + 1
            newComp.flash_service_port =
              (lastComp.flash_service_port || DEF_TIFLASH_SERVICE_PORT) + 1
            newComp.flash_proxy_port =
              (lastComp.flash_proxy_port || DEF_TIFLASH_PROXY_PORT) + 1
            newComp.flash_proxy_status_port =
              (lastComp.flash_proxy_status_port ||
                DEF_TIFLASH_PROXY_STATUS_PORT) + 1
            newComp.metrics_port =
              (lastComp.metrics_port || DEF_TIFLASH_METRICS_PORT) + 1
            break
          case 'PD':
            newComp.client_port = (lastComp.peer_port || DEF_PD_PEER_PORT) + 1
            newComp.peer_port = (lastComp.peer_port || DEF_PD_PEER_PORT) + 2
            break
          case 'Prometheus':
            newComp.port = (lastComp.port || DEF_PROM_PORT) + 1
            break
          case 'Grafana':
            newComp.port = (lastComp.port || DEF_GRAFANA_PORT) + 2
            break
          case 'AlertManager':
            newComp.web_port =
              (lastComp.cluster_port || DEF_ALERT_CLUSTER_PORT) + 1
            newComp.cluster_port =
              (lastComp.cluster_port || DEF_ALERT_CLUSTER_PORT) + 2
            break
        }
        comp = newComp
      }
      setComponents({
        ...components,
        [comp.id]: comp,
      })
    },
    [components, setComponents]
  )

  const handleUpdateComponent = useCallback(
    (comp: IComponent) => {
      setComponents({
        ...components,
        [comp.id]: comp,
      })
      setCurComp(undefined)
    },
    [components, setComponents]
  )

  const handleDeleteComponent = useCallback(
    (comp: IComponent) => {
      const newComps = { ...components }
      delete newComps[comp.id]
      setComponents(newComps)
    },
    [components, setComponents]
  )

  const handleDeleteComponents = useCallback(
    (machine: IMachine, forScaleOut: boolean) => {
      const newComps = { ...components }
      const belongedComps = Object.values(components).filter(
        (c) => c.machineID === machine.id
      )
      for (const c of belongedComps) {
        if (c.for_scale_out === forScaleOut) {
          delete newComps[c.id]
        }
      }
      setComponents(newComps)
    },
    [components, setComponents]
  )

  function handleDeploy(values: any) {
    const topoYaml = yaml.stringify(
      genTopo({ machines, components, forScaleOut })
    )
    deployCluster({
      ...values,
      topo_yaml: topoYaml,
      global_login_options: globalLoginOptions,
    })
    navigate('/status')
  }

  function handleScaleOut() {
    // save in local
    // cluster name, scale out nodes
    const scaleOutComps = Object.values(components).filter(
      (comp) => comp.for_scale_out
    )
    if (scaleOutComps.length === 0) {
      Modal.warn({
        title: '扩容无法进行',
        content: '没有可扩容的组件',
      })
      return
    }

    const scaleOutNodes: any[] = []
    for (const comp of scaleOutComps) {
      let port: number = 0
      let rec = comp as any

      switch (rec.type) {
        case 'TiDB':
          port = rec.port || DEF_TIDB_PORT
          break
        case 'TiKV':
          port = rec.port || DEF_TIKV_PORT
          break
        case 'TiFlash':
          port = rec.tcp_port || DEF_TIFLASH_TCP_PORT
          break
        case 'PD':
          port = rec.client_port || DEF_PD_CLIENT_PORT
          break
        case 'Prometheus':
          port = rec.port || DEF_PROM_PORT
          break
        case 'Grafana':
          port = rec.port || DEF_GRAFANA_PORT
          break
        case 'AlertManager':
          port = rec.web_port || DEF_ALERT_WEB_PORT
          break
      }

      const machine = machines[comp.machineID]
      scaleOutNodes.push({ id: comp.id, node: `${machine.host}:${port}` })
    }
    setCurScaleOutNodes({
      cluster_name: clusterName!,
      scale_out_nodes: scaleOutNodes,
    })

    // scale out
    const topoYaml = yaml.stringify(
      genTopo({ machines, components, forScaleOut })
    )
    scaleOutCluster(clusterName!, {
      topo_yaml: topoYaml,
      global_login_options: globalLoginOptions,
    })
    navigate('/status')
  }

  function startOperate() {
    setPreviewYaml(false)

    if (forScaleOut) {
      handleScaleOut()
    } else {
      form.validateFields().then((values) => {
        setDeployReq(values as any)
        handleDeploy(values)
      })
    }
  }

  return (
    <Root>
      {forScaleOut ? (
        <Button type="primary" onClick={() => setPreviewYaml(true)}>
          预览扩容拓扑
        </Button>
      ) : (
        <Form form={form} layout="inline" initialValues={deployReq}>
          <Form.Item
            label="集群名字"
            name="cluster_name"
            rules={[{ required: true, message: '请输出集群名字' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="TiDB 版本"
            name="tidb_version"
            rules={[{ required: true, message: '请选择 TiDB 版本' }]}
          >
            <Select style={{ width: 100 }}>
              {TIDB_VERSIONS.map((ver) => (
                <Select.Option key={ver} value={ver}>
                  {ver}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={() => setPreviewYaml(true)}>
              预览部署拓扑
            </Button>
          </Form.Item>
        </Form>
      )}

      <div style={{ marginTop: 16 }}>
        <DeploymentTable
          forScaleOut={forScaleOut}
          machines={machines}
          components={components}
          onAddComponent={handleAddComponent}
          onEditComponent={(rec) => setCurComp(rec)}
          onDeleteComponent={handleDeleteComponent}
          onDeleteComponents={handleDeleteComponents}
        />
      </div>

      <Drawer
        title={curComp && `修改 ${curComp.type} 组件`}
        width={400}
        closable={true}
        visible={curComp !== undefined}
        onClose={() => setCurComp(undefined)}
        destroyOnClose={true}
      >
        <EditCompForm comp={curComp} onUpdateComp={handleUpdateComponent} />
      </Drawer>

      <Modal
        title="Topology YAML"
        visible={previewYaml}
        okText={forScaleOut ? '开始扩容' : '开始部署'}
        cancelText="返回修改"
        onOk={startOperate}
        onCancel={() => setPreviewYaml(false)}
      >
        <TopoPreview
          machines={machines}
          components={components}
          forScaleOut={forScaleOut}
        />
      </Modal>
    </Root>
  )
}