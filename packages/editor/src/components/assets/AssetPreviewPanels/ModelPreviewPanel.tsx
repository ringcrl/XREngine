import React, { useEffect, useRef, useState } from 'react'

import LoadingView from '@xrengine/client-core/src/admin/common/LoadingView'
import { useRender3DPanelSystem } from '@xrengine/client-core/src/user/components/Panel3D/useRender3DPanelSystem'
import { loadAvatarModelAsset } from '@xrengine/engine/src/avatar/functions/avatarFunctions'

import styles from '../styles.module.scss'

export const ModelPreviewPanel = (props) => {
  const url = props.resourceProps.resourceUrl
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const panelRef = useRef() as React.MutableRefObject<HTMLDivElement>

  const renderPanel = useRender3DPanelSystem(panelRef)
  const { scene } = renderPanel.state

  useEffect(() => {
    const loadModel = async () => {
      try {
        const model = await loadAvatarModelAsset(url)
        model.name = 'avatar'
        const result = scene.value.getObjectByName(model.name)
        if (result) scene.value.remove(result)
        scene.value.add(model)
        setLoading(false)
      } catch (err) {
        setLoading(false)
        setError(err.message)
      }
    }

    loadModel()
  }, [])

  return (
    <>
      {loading && <LoadingView />}
      {error && (
        <div className={styles.container}>
          <h1 className={styles.error}>{error}</h1>
        </div>
      )}
      <div id="stage" ref={panelRef} style={{ width: '100%', minHeight: '250px', height: '100%' }}></div>
    </>
  )
}
