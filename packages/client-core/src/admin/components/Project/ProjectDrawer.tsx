import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GithubAppInterface } from '@xrengine/common/src/interfaces/GithubAppInterface'

import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import DialogActions from '@mui/material/DialogActions'
import DialogTitle from '@mui/material/DialogTitle'

import { NotificationService } from '../../../common/services/NotificationService'
import { ProjectService } from '../../../common/services/ProjectService'
import DrawerView from '../../common/DrawerView'
import InputRadio from '../../common/InputRadio'
import InputSelect, { InputMenuItem } from '../../common/InputSelect'
import InputText from '../../common/InputText'
import LoadingView from '../../common/LoadingView'
import styles from '../../styles/admin.module.scss'

interface Props {
  open: boolean
  repos: GithubAppInterface[]
  onClose: () => void
}

const ProjectDrawer = ({ open, repos, onClose }: Props) => {
  const { t } = useTranslation()
  const [projectURL, setProjectURL] = useState('')
  const [processing, setProcessing] = useState(false)
  const [source, setSource] = useState('url')
  const [error, setError] = useState('')
  const [submitDisabled, setSubmitDisabled] = useState(true)
  const [showTagSelector, setShowTagSelector] = useState(false)
  const [tagData, setTagData] = useState([])
  const [selectedTag, setSelectedTag] = useState('')

  const handleSubmit = async () => {
    try {
      if (projectURL) {
        setProcessing(true)
        const urlParts = projectURL.split('/')
        let projectName = urlParts.pop()
        await ProjectService.uploadProject(projectURL, projectName, false)
        setProcessing(false)
        handleClose()
      } else {
        setError(t('admin:components.project.urlCantEmpty'))
      }
    } catch (err) {
      setProcessing(false)
      NotificationService.dispatchNotify(err.message, { variant: 'error' })
    }
  }

  const handleChangeSource = (e) => {
    const { value } = e.target
    setSource(value)
  }

  const handleChange = (e) => {
    const { value } = e.target
    setError(value ? '' : t('admin:components.project.urlRequired'))
    setProjectURL(value)
  }

  const handleClose = () => {
    setProjectURL('')
    setSelectedTag('')
    setError('')
    onClose()
  }

  const handleInputBlur = async (e) => {
    try {
      const projectResponse = await ProjectService.fetchPublicProjectTags(e.target.value)
      if (projectResponse.error === 'invalidUrl') {
        setShowTagSelector(false)
        setError(projectResponse.text)
      } else {
        setShowTagSelector(true)
        setTagData(projectResponse)
      }
    } catch(err) {
      setShowTagSelector(false)
      console.log('projectResponse error', err)
    }
  }

  const handleTagChange = async (e) => {
    setSelectedTag(e.target.value)
    setError('')
    setSubmitDisabled(false)
  }

  const projectMenu: InputMenuItem[] = repos.map((el) => {
    return {
      value: el.repositoryPath,
      label: `${el.name} (${el.user})`
    }
  })

  const tagMenu: InputMenuItem[] = tagData.map(el => {
    return {
      value: el.commitSHA,
      label: `${el.commitSHA} - Project Version ${el.projectVersion}, Engine Version ${el.engineVersion}`
    }
  })

  return (
    <DrawerView open={open} onClose={onClose}>
      <Container maxWidth="sm" className={styles.mt20}>
        <DialogTitle className={styles.textAlign}>{t('admin:components.project.addProject')}</DialogTitle>

        {!processing && repos && repos.length > 0 && (
          <InputRadio
            name="source"
            label={t('admin:components.project.source')}
            value={source}
            options={[
              { value: 'url', label: t('admin:components.project.publicUrl') },
              { value: 'list', label: t('admin:components.project.selectFromList') }
            ]}
            onChange={handleChangeSource}
          />
        )}

        {!processing && tagData && tagData.length > 0 && showTagSelector && (
            <InputSelect
              name="tagData"
              label={t('admin:components.project.tagData')}
              value={selectedTag}
              menu={tagMenu}
              error={error}
              onChange={handleTagChange}
            />
        )}

        {!processing && source === 'list' && repos && repos.length != 0 ? (
          <InputSelect
            name="projectURL"
            label={t('admin:components.project.project')}
            value={projectURL}
            menu={projectMenu}
            error={error}
            onChange={handleChange}
          />
        ) : (
          <InputText
            name="urlSelect"
            label={t('admin:components.project.githubPublicUrl')}
            value={projectURL}
            error={error}
            onChange={handleChange}
            onBlur={handleInputBlur}
          />
        )}

        {processing && <LoadingView title={t('admin:components.project.processing')} variant="body1" />}

        <DialogActions>
          {!processing && (
            <>
              <Button className={styles.outlinedButton} onClick={onClose}>
                {t('admin:components.common.cancel')}
              </Button>
              <Button className={styles.gradientButton} disabled={submitDisabled} onClick={handleSubmit}>
                {t('admin:components.common.submit')}
              </Button>
            </>
          )}
        </DialogActions>
      </Container>
    </DrawerView>
  )
}

export default ProjectDrawer
