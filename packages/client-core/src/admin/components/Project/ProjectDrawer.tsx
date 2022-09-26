import classNames from 'classnames'
import React, {useEffect, useState} from 'react'
import { useTranslation } from 'react-i18next'

import { GithubAppInterface } from '@xrengine/common/src/interfaces/GithubAppInterface'

import Cancel from '@mui/icons-material/Cancel'
import CheckBox from '@mui/icons-material/CheckBox'
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
  const [sourceURL, setSourceURL] = useState('')
  const [destinationURL, setDestinationURL] = useState('')
  const [processing, setProcessing] = useState(false)
  const [branchProcessing, setBranchProcessing] = useState(false)
  const [destinationProcessing, setDestinationProcessing] = useState(false)
  const [destinationValid, setDestinationValid] = useState(false)
  const [destinationError, setDestinationError] = useState('')
  const [sourceValid, setSourceValid] = useState(false)
  const [tagsProcessing, setTagsProcessing] = useState(false)
  const [sourceType, setSourceType] = useState('url')
  const [destinationType, setDestinationType] = useState('url')
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
      if (source) {
        setProcessing(true)
        const urlParts = source.split('/')
        let projectName = urlParts.pop()
        await ProjectService.uploadProject(source, projectName, !existingProject, selectedSHA)
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

  const resetSourceState = ({ resetSourceURL=true, resetBranch=true, resetSourceType=false }) => {
    if (resetSourceURL) setSourceURL('')
    if (resetSourceType) setSourceType('url')
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
    setSourceValid(false)
  }

  const resetDestinationState = ({ resetDestinationURL=true}) => {
    if (resetDestinationURL) setDestinationURL('')
    setDestinationType('url')
    setDestinationValid(false)
    setDestinationError('')
  }

  const handleChangeDestinationType = (e) => {
    resetDestinationState({})
    setDestinationType(e.target.value)
  }

  const handleChangeSourceType = (e) => {
    resetSourceState({})
    setSourceType(e.target.value)
  }

  const handleChangeSource = (e) => {
    const { value } = e.target
    setUrlError(value ? '' : t('admin:components.project.urlRequired'))
    setSourceURL(value)
  }

  const handleChangeDestination = (e) => {
    const { value } = e.target
    setDestinationError(value ? '' : t('admin:components.project.urlRequired'))
    setDestinationURL(value)
  }

  const handleClose = () => {
    resetSourceState({ resetSourceURL: true})
    resetDestinationState({})
    onClose()
  }

  const handleChangeSourceRepo = async (e) => {
    try {
      resetSourceState({resetSourceURL: false })
      setBranchProcessing(true)
      const branchResponse = await ProjectService.fetchProjectBranches(e.target.value, sourceType === 'url', existingProject)
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
      resetDestinationState({ resetDestinationURL: false })
      setDestinationValid(false)
      setDestinationProcessing(true)
      const destinationResponse = await ProjectService.checkDestinationURLValid(e.target.value, destinationType === 'url')
      setDestinationProcessing(false)
      if (destinationResponse.error === 'invalidUrl') {
        setDestinationValid(false)
        setDestinationError(destinationResponse.text)
      } else {
        setDestinationValid(destinationResponse.destinationValid)
      }
    } catch(err) {
      setDestinationProcessing(false)
      setDestinationValid(false)
      console.log('Destination error', err)
    }
  }

  const handleChangeBranch = async(e) => {
    try {
      resetSourceState({resetSourceURL: false, resetBranch: false })
      setSelectedBranch(e.target.value)
      setTagsProcessing(true)
      const projectResponse = await ProjectService.fetchProjectTags(sourceURL, e.target.value, sourceType === 'url')
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
    setSourceValid(true)
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
      setSourcURL(inputProjectURL)
      handleChangeDestinationRepo({
        target: {
          value: inputProjectURL
        }
      })
    }
  }, [])

  useEffect(() => {
    if (destinationValid && sourceValid) {
      const sourceProjectMatchesDestination = ProjectService.checkSourceMatchesDestination()
      setSubmitDisabled(!sourceProjectMatchesDestination)
    }
  }, [destinationValid, sourceValid])

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
                name="destination"
                label={t('admin:components.project.destinationType')}
                value={destinationType}
                options={repos && repos.length > 0 ? [
                  { value: 'url', label: t('admin:components.project.publicUrl') },
                  { value: 'list', label: t('admin:components.project.githubAppInstallation') }
                ] : [
                  { value: 'url', label: t('admin:components.project.publicUrl') },
                ]}
                onChange={handleChangeDestinationType}
            />
        )}

        {!existingProject && destinationType === 'list' && repos && repos.length != 0 ? (
            <InputSelect
                name="projectURL"
                label={t('admin:components.project.project')}
                value={destinationURL}
                menu={projectMenu}
                error={destinationError}
                onChange={(e) => { handleChangeDestination(e); handleChangeDestinationRepo(e);}}
            />
        ) : (
            (hasGithubProvider || existingProject) ?
                <InputText
                    name="urlSelect"
                    label={t('admin:components.project.githubPublicUrl')}
                    value={destinationURL}
                    error={destinationError}
                    disabled={existingProject}
                    onChange={handleChangeDestination}
                    onBlur={handleChangeDestinationRepo}
                /> : <div className={styles.textAlign}>{t('admin:components.project.needsGithubProvider')}</div>
        )}

        {destinationProcessing && <LoadingView title={t('admin:components.project.destinationProcessing')} variant="body1" fullHeight={false}/>}

        <DialogTitle className={classNames({
          [styles.textAlign]: true,
          [styles.drawerSubHeader]: true
        })}>
          {t('admin:components.project.source')}
        </DialogTitle>

        {!processing && !existingProject && (
          <InputRadio
            name="source"
            label={t('admin:components.project.sourceType')}
            value={sourceType}
            options={repos && repos.length > 0 ? [
              { value: 'url', label: t('admin:components.project.publicUrl') },
              { value: 'list', label: t('admin:components.project.githubAppInstallation') }
            ] : [
              { value: 'url', label: t('admin:components.project.publicUrl') },
            ]}
            onChange={handleChangeSourceType}
          />
        )}

        {!existingProject && sourceType === 'list' && repos && repos.length != 0 ? (
          <InputSelect
            name="projectURL"
            label={t('admin:components.project.project')}
            value={sourceURL}
            menu={projectMenu}
            error={urlError}
            onChange={(e) => { handleChangeSource(e); handleChangeSourceRepo(e);}}
          />
        ) : (
          (hasGithubProvider || existingProject) ?
          <InputText
            name="urlSelect"
            label={t('admin:components.project.githubPublicUrl')}
            value={sourceURL}
            error={urlError}
            disabled={existingProject}
            onChange={handleChangeSource}
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

        {branchProcessing && <LoadingView title={t('admin:components.project.branchProcessing')} variant="body1" fullHeight={false} />}
        {tagsProcessing && <LoadingView title={t('admin:components.project.tagsProcessing')} variant="body1" fullHeight={false} />}

        {!processing && !branchProcessing && !tagsProcessing && selectedSHA && selectedSHA.length > 0 && tagData.length > 0 && !tagData.find(tag => tag.commitSHA === selectedSHA)?.matchesEngineVersion &&
            (
                <div className={styles.projectMismatchWarning}>
                  <WarningAmberIcon />
                  {t('admin:components.project.mismatchedProjectWarning')}
                </div>
            )
        }

        {processing && <LoadingView title={t('admin:components.project.processing')} variant="body1" fullHeight={false} />}

        <div className={styles.validContainer}>
          {destinationValid && <CheckBox />}
          {!destinationValid && <Cancel />}
          Destination URL valid and accessible?
        </div>

        <div className={styles.validContainer}>
          {sourceValid && <CheckBox />}
          {!sourceValid && <Cancel />}
          Source URL valid and accessible?
        </div>

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
