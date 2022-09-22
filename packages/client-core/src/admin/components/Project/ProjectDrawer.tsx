import classNames from 'classnames'
import React, {useEffect, useState} from 'react'
import { useTranslation } from 'react-i18next'

import { GithubAppInterface } from '@xrengine/common/src/interfaces/GithubAppInterface'

import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import DialogActions from '@mui/material/DialogActions'
import DialogTitle from '@mui/material/DialogTitle'

import { NotificationService } from '../../../common/services/NotificationService'
import { ProjectService } from '../../../common/services/ProjectService'
import { useAuthState } from "../../../user/services/AuthService";
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

const ProjectDrawer = ({ open, repos, inputProjectURL='', existingProject=false, onClose }: Props) => {
  const { t } = useTranslation()
  const [projectURL, setProjectURL] = useState('')
  const [processing, setProcessing] = useState(false)
  const [branchProcessing, setBranchProcessing] = useState(false)
  const [destinationProcessing, setDestinationProcessing] = useState(false)
  const [destinationValid, setDestinationValid] = useState(false)
  const [destinationError, setDestinationError] = useState('')
  const [tagsProcessing, setTagsProcessing] = useState(false)
  const [source, setSource] = useState('url')
  const [destination, setDestination] = useState('url')
  const [urlError, setUrlError] = useState('')
  const [branchError, setBranchError] = useState('')
  const [tagError, setTagError] = useState('')
  const [submitDisabled, setSubmitDisabled] = useState(true)
  const [showBranchSelector, setShowBranchSelector] = useState(false)
  const [showTagSelector, setShowTagSelector] = useState(false)
  const [branchData, setBranchData] = useState([])
  const [tagData, setTagData] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedSHA, setSelectedSHA] = useState('')

  const selfUser = useAuthState().user

  const handleSubmit = async () => {
    try {
      if (projectURL) {
        setProcessing(true)
        const urlParts = projectURL.split('/')
        let projectName = urlParts.pop()
        await ProjectService.uploadProject(projectURL, projectName, !existingProject, selectedSHA)
        setProcessing(false)
        handleClose()
      } else {
        setUrlError(t('admin:components.project.urlCantEmpty'))
      }
    } catch (err) {
      setProcessing(false)
      NotificationService.dispatchNotify(err.message, { variant: 'error' })
    }
  }

  const resetState = ({ resetProjectURL=true, resetBranch=true, resetDestination=false, resetSource=false }) => {
    if (resetProjectURL) setProjectURL('')
    if (resetSource) setSource('url')
    if (resetDestination) {
      setDestination('url')
      setDestinationValid(false)
    }
    if (resetBranch) {
      setSelectedBranch('')
      setBranchData([])
      setShowBranchSelector(false)
    }
    setSelectedSHA('')
    setTagData([])
    setShowTagSelector(false)
    setSubmitDisabled(true)
    setUrlError('')
    setBranchError('')
    setTagError('')
  }

  const handleChangeDestination = (e) => {
    const { value } = e.target
    setSource(value)
  }

  const handleChangeSource = (e) => {
    resetState({})
    const { value } = e.target
    setSource(value)
  }

  const handleChange = (e) => {
    const { value } = e.target
    setUrlError(value ? '' : t('admin:components.project.urlRequired'))
    setProjectURL(value)
  }

  const handleClose = () => {
    resetState({resetDestination: true, resetSource: true})
    onClose()
  }

  const handleChangeSourceRepo = async (e) => {
    try {
      resetState({resetProjectURL: false })
      setBranchProcessing(true)
      const branchResponse = await ProjectService.fetchProjectBranches(e.target.value, source === 'url', existingProject)
      setBranchProcessing(false)
      if (branchResponse.error === 'invalidUrl') {
        setShowBranchSelector(false)
        setBranchError(branchResponse.text)
      } else {
        setShowBranchSelector(true)
        setBranchData(branchResponse)
      }
    } catch(err) {
      setBranchProcessing(false)
      setShowBranchSelector(false)
      console.log('Branch fetch error', err)
    }
  }

  const handleChangeDestinationRepo = async (e) => {
    try {
      resetState({})
      setDestinationValid(false)
      setDestinationProcessing(true)
      const destinationResponse = await ProjectService.fetchProjectBranches(e.target.value, source === 'url', existingProject)
      setDestinationProcessing(false)
      if (destinationResponse.error === 'invalidUrl') {
        setDestinationValid(false)
        setDestinationError(destinationResponse.text)

      } else {
        setDestinationValid(true)
      }
    } catch(err) {
      setDestinationProcessing(false)
      setDestinationValid(false)
      console.log('Destination error', err)
    }
  }

  const handleChangeBranch = async(e) => {
    try {
      resetState({resetProjectURL: false, resetBranch: false })
      setSelectedBranch(e.target.value)
      setTagsProcessing(true)
      const projectResponse = await ProjectService.fetchProjectTags(projectURL, e.target.value, source === 'url')
      setTagsProcessing(false)
      if (projectResponse.error === 'invalidUrl') {
        setShowTagSelector(false)
        setTagError(projectResponse.text)
      } else {
        setShowTagSelector(true)
        setTagData(projectResponse)
      }
    } catch(err) {
      setTagsProcessing(false)
      setShowTagSelector(false)
      console.log('projectResponse error', err)
    }
  }

  const hasGithubProvider = selfUser.identityProviders.value.find(ip => ip.type === 'github')

  const handleTagChange = async (e) => {
    setSelectedSHA(e.target.value)
    setTagError('')
    setSubmitDisabled(false)
  }

  const projectMenu: InputMenuItem[] = repos.map((el) => {
    return {
      value: el.repositoryPath,
      label: `${el.name} (${el.user})`
    }
  })

  const branchMenu: InputMenuItem[] = branchData.map(el => {
    return {
      value: el.name,
      label: `Branch: ${el.name} ${el.isMain ? '(Root branch)' : '(Deployment branch)'}`
    }
  })

  const tagMenu: InputMenuItem[] = tagData.map(el => {
    return {
      value: el.commitSHA,
      label: `Project Version ${el.projectVersion} - Engine Version ${el.engineVersion} - Commit ${el.commitSHA.slice(0, 8)}`
    }
  })
  
  useEffect(() => {
    if (inputProjectURL && inputProjectURL.length > 0) {
      setProjectURL(inputProjectURL)
      handleChangeDestinationRepo({
        target: {
          value: inputProjectURL
        }
      })
    }
  }, [])

  return (
    <DrawerView open={open} onClose={handleClose}>
      <Container maxWidth="sm" className={styles.mt20}>
        <DialogTitle className={classNames({
          [styles.textAlign]: true,
          [styles.drawerHeader]: true
        })}> {existingProject ? t('admin:components.project.updateProject'): t('admin:components.project.addProject')}</DialogTitle>

        <DialogTitle className={classNames({
            [styles.textAlign]: true,
            [styles.drawerSubHeader]: true
        })}>
          {t('admin:components.project.destination')}
        </DialogTitle>

        {!processing && !existingProject && (
            <InputRadio
                name="source"
                label={t('admin:components.project.destinationType')}
                value={destination}
                options={repos && repos.length > 0 ? [
                  { value: 'url', label: t('admin:components.project.publicUrl') },
                  { value: 'list', label: t('admin:components.project.selectFromList') }
                ] : [
                  { value: 'url', label: t('admin:components.project.publicUrl') },
                ]}
                onChange={handleChangeDestination}
            />
        )}

        {!existingProject && destination === 'list' && repos && repos.length != 0 ? (
            <InputSelect
                name="projectURL"
                label={t('admin:components.project.project')}
                value={destination}
                menu={projectMenu}
                error={destinationError}
                onChange={(e) => { handleChangeDestination(e); handleChangeDestinationRepo(e);}}
            />
        ) : (
            (hasGithubProvider || existingProject) ?
                <InputText
                    name="urlSelect"
                    label={t('admin:components.project.githubPublicUrl')}
                    value={projectURL}
                    error={destinationError}
                    disabled={existingProject}
                    onChange={handleChangeDestination}
                    onBlur={handleChangeDestinationRepo}
                /> : <div className={styles.textAlign}>{t('admin:components.project.needsGithubProvider')}</div>
        )}

        {!processing && !existingProject && (
          <InputRadio
            name="source"
            label={t('admin:components.project.sourceType')}
            value={source}
            options={repos && repos.length > 0 ? [
              { value: 'url', label: t('admin:components.project.publicUrl') },
              { value: 'list', label: t('admin:components.project.githubAppInstallation') }
            ] : [
              { value: 'url', label: t('admin:components.project.publicUrl') },
            ]}
            onChange={handleChangeSource}
          />
        )}

        {!existingProject && source === 'list' && repos && repos.length != 0 ? (
          <InputSelect
            name="projectURL"
            label={t('admin:components.project.project')}
            value={projectURL}
            menu={projectMenu}
            error={urlError}
            onChange={(e) => { handleChange(e); handleChangeSourceRepo(e);}}
          />
        ) : (
          (hasGithubProvider || existingProject) ?
          <InputText
            name="urlSelect"
            label={t('admin:components.project.githubPublicUrl')}
            value={projectURL}
            error={urlError}
            disabled={existingProject}
            onChange={handleChange}
            onBlur={handleChangeSourceRepo}
          /> : <div className={styles.textAlign}>{t('admin:components.project.needsGithubProvider')}</div>
        )}

        {!processing && !branchProcessing && branchData && branchData.length > 0 && showBranchSelector && (
            <InputSelect
                name="branchData"
                label={t('admin:components.project.branchData')}
                value={selectedBranch}
                menu={branchMenu}
                error={branchError}
                onChange={handleChangeBranch}
            />
        )}

        {!processing && !tagsProcessing && tagData && tagData.length > 0 && showTagSelector && (
            <InputSelect
                name="tagData"
                label={t('admin:components.project.tagData')}
                value={selectedSHA}
                menu={tagMenu}
                error={tagError}
                onChange={handleTagChange}
            />
        )}

        {branchProcessing && <LoadingView title={t('admin:components.project.branchProcessing')} variant="body1" />}
        {tagsProcessing && <LoadingView title={t('admin:components.project.tagsProcessing')} variant="body1" />}

        {!processing && !branchProcessing && !tagsProcessing && selectedSHA && selectedSHA.length > 0 && tagData.length > 0 && !tagData.find(tag => tag.commitSHA === selectedSHA)?.matchesEngineVersion &&
            (
                <div className={styles.projectMismatchWarning}>
                  <WarningAmberIcon />
                  {t('admin:components.project.mismatchedProjectWarning')}
                </div>
            )
        }

        {processing && <LoadingView title={t('admin:components.project.processing')} variant="body1" />}

        <DialogActions>
          {!processing && (
            <>
              <Button className={styles.outlinedButton} onClick={handleClose}>
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
