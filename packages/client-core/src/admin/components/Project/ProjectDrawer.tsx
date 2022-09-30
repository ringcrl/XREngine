import classNames from 'classnames'
import React, {useEffect, useState} from 'react'
import { useTranslation } from 'react-i18next'

import { GithubAppInterface } from '@xrengine/common/src/interfaces/GithubAppInterface'

import Cancel from '@mui/icons-material/Cancel'
import CheckCircle from '@mui/icons-material/CheckCircle'
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
import {ProjectInterface} from "@xrengine/common/src/interfaces/ProjectInterface";

interface Props {
  open: boolean
  repos: GithubAppInterface[]
  inputProject?: ProjectInterface | null
  existingProject?: boolean
  onClose: () => void
  changeDestination?: boolean
}

const ProjectDrawer = ({ open, repos, inputProject, existingProject=false, onClose, changeDestination=false }: Props) => {
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
  const [sourceVsDestinationProcessing, setSourceVsDestinationProcessing] = useState(false)
  const [sourceVsDestinationError, setSourceVsDestinationError] = useState('')
  const [sourceProjectMatchesDestination, setSourceProjectMatchesDestination] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [destinationProjectName, setDestinationProjectName] = useState('')
  const [destinationRepoEmpty, setDestinationRepoEmpty] = useState(false)
  const [sourceProjectName, setSourceProjectName] = useState('')

  const selfUser = useAuthState().user

  const handleSubmit = async () => {
    try {
      if (existingProject && changeDestination) {
        await ProjectService.setRepositoryPath(inputProject.id, destinationURL)
        handleClose()
      }
      else if (sourceURL) {
        setProcessing(true)
        await ProjectService.uploadProject(sourceURL, destinationURL, projectName, true, selectedSHA)
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
    setSourceProjectName('')
    setSourceProjectMatchesDestination(false)
  }

  const resetDestinationState = ({ resetDestinationURL=true, resetDestinationType=true}) => {
    setSubmitDisabled(true)
    if (resetDestinationURL) setDestinationURL('')
    if (resetDestinationType) setDestinationType('url')
    setDestinationValid(false)
    setDestinationError('')
    setSourceProjectMatchesDestination(false)
    setDestinationProjectName('')
    setDestinationRepoEmpty(false)
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
    resetSourceState({ resetSourceURL: true, resetSourceType: true})
    resetDestinationState({resetDestinationType: true})
    onClose()
  }

  const handleChangeSourceRepo = async (e) => {
    try {
      resetSourceState({resetSourceURL: false, resetSourceType: false })
      setBranchProcessing(true)
      const branchResponse = await ProjectService.fetchProjectBranches(e.target.value, sourceType === 'url')
      setBranchProcessing(false)
      if (branchResponse.error) {
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
    if (e.target.value && e.target.value.length > 0) {
      try {
        resetDestinationState({resetDestinationURL: false, resetDestinationType: false})
        setDestinationValid(false)
        setDestinationProcessing(true)
        const destinationResponse = await ProjectService.checkDestinationURLValid({
          url: e.target.value,
          isPublicURL: destinationType === 'url',
          inputProjectURL: inputProject?.repositoryPath
        })
        setDestinationProcessing(false)
        if (destinationResponse.error) {
          setDestinationValid(false)
          setDestinationError(destinationResponse.text)
        } else {
          if (destinationResponse.destinationValid) {
            if (existingProject && changeDestination) setSubmitDisabled(false)
            setDestinationValid(destinationResponse.destinationValid)
            if (destinationResponse.projectName) setDestinationProjectName(destinationResponse.projectName)
            if (destinationResponse.repoEmpty) setDestinationRepoEmpty(true)
          } else {
            setDestinationValid(false)
            setDestinationError(destinationResponse.text)
          }
        }
      } catch (err) {
        setDestinationProcessing(false)
        setDestinationValid(false)
        console.log('Destination error', err)
      }
    }
  }

  const handleChangeBranch = async(e) => {
    try {
      resetSourceState({resetSourceURL: false, resetBranch: false })
      setSelectedBranch(e.target.value)
      setTagsProcessing(true)
      const projectResponse = await ProjectService.fetchProjectTags(sourceURL, e.target.value, sourceType === 'url')
      setTagsProcessing(false)
      if (projectResponse.error) {
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
    const matchingTag = tagData.find(data => data.commitSHA === e.target.value)
    setSourceProjectName(matchingTag.projectName || '')
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
      label: `Project Version ${el.projectVersion} -- Engine Version ${el.engineVersion} -- Commit ${el.commitSHA.slice(0, 8)}`
    }
  })
  
  useEffect(() => {
    if (open && inputProject) {
      setDestinationURL(inputProject.repositoryPath)
      handleChangeDestinationRepo({
        target: {
          value: inputProject.repositoryPath
        }
      })
    }
  }, [open])

  useEffect(() => {
    if (destinationValid && sourceValid) {
      setSourceVsDestinationProcessing(true)
      ProjectService.checkSourceMatchesDestination({ sourceURL, destinationURL, sourceIsPublicURL: sourceType === 'url', destinationIsPublicURL: destinationType === 'url'})
          .then(res => {
            setSourceVsDestinationProcessing(false)
            if (res.error) {
              setProjectName('')
              setSubmitDisabled(true)
              setSourceProjectMatchesDestination(false)
              setSourceVsDestinationError(res.text)
            } else {
              setProjectName(res.projectName)
              setSubmitDisabled(!res.sourceProjectMatchesDestination)
              setSourceProjectMatchesDestination(res.sourceProjectMatchesDestination)
            }
          })
    } else {
      if (!(existingProject && changeDestination)) {
        setSourceVsDestinationProcessing(false)
        setProjectName('')
        setSubmitDisabled(true)
        setSourceProjectMatchesDestination(false)
      }
    }
  }, [destinationValid, sourceValid])

  return (
    <DrawerView open={open} onClose={handleClose}>
      <Container maxWidth="sm" className={styles.mt20}>
        <DialogTitle className={classNames({
          [styles.textAlign]: true,
          [styles.drawerHeader]: true
        })}> {(existingProject && !changeDestination) ? t('admin:components.project.updateProject') : (existingProject && changeDestination) ? t('admin:components.project.changeDestination') : t('admin:components.project.addProject')}</DialogTitle>

        <DialogTitle className={classNames({
            [styles.textAlign]: true,
            [styles.drawerSubHeader]: true
        })}>
          {t('admin:components.project.destination')}
        </DialogTitle>

        {!processing && !(existingProject && !changeDestination) && (
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

        {!(existingProject && !changeDestination) && destinationType === 'list' && repos && repos.length != 0 ? (
            <InputSelect
                name="projectURL"
                label={t('admin:components.project.project')}
                value={destinationURL}
                menu={projectMenu}
                error={destinationError}
                onChange={(e) => { handleChangeDestination(e); handleChangeDestinationRepo(e);}}
            />
        ) : (
            hasGithubProvider ?
              <InputText
                  name="urlSelect"
                  label={t('admin:components.project.githubPublicUrl')}
                  value={destinationURL}
                  error={destinationError}
                  disabled={(existingProject || false) && !changeDestination}
                  onChange={handleChangeDestination}
                  onBlur={handleChangeDestinationRepo}
              /> : <div className={styles.textAlign}>{t('admin:components.project.needsGithubProvider')}</div>
        )}

        {!destinationProcessing && destinationProjectName.length > 0 && <div className={styles.projectVersion}>{`${t('admin:components.project.destinationProjectName')}: ${destinationProjectName}`}</div>}
        {!destinationProcessing && destinationRepoEmpty && <div className={styles.projectVersion}>{t('admin:components.project.destinationRepoEmpty')}</div>}
        {destinationProcessing && <LoadingView title={t('admin:components.project.destinationProcessing')} variant="body1" fullHeight={false}/>}

        { !changeDestination && <DialogTitle className={classNames({
          [styles.textAlign]: true,
          [styles.drawerSubHeader]: true
        })}>
          {t('admin:components.project.source')}
        </DialogTitle>}

        {!processing && !changeDestination && (
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

        {!changeDestination && <div>
          {sourceType === 'list' && repos && repos.length != 0 ? (
            <InputSelect
              name="projectURL"
              label={t('admin:components.project.project')}
              value={sourceURL}
              menu={projectMenu}
              error={urlError}
              onChange={(e) => { handleChangeSource(e); handleChangeSourceRepo(e);}}
            />
          ) : (
            hasGithubProvider ?
            <InputText
              name="urlSelect"
              label={t('admin:components.project.githubPublicUrl')}
              value={sourceURL}
              error={urlError}
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
        </div>}

        {!processing && !tagsProcessing && sourceProjectName.length > 0 && <div className={styles.projectVersion}>{`${t('admin:components.project.sourceProjectName')}: ${sourceProjectName}`}</div>}

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

        {sourceVsDestinationProcessing && <LoadingView title={t('admin:components.project.sourceVsDestinationProcessing')} variant="body1" fullHeight={false} />}
        {sourceVsDestinationError.length > 0 && <div className={styles.errorText}>{sourceVsDestinationError}</div>}

        <div className={classNames({
          [styles.validContainer]: true,
          [styles.valid]: destinationValid,
          [styles.invalid]: !destinationValid
        })}>
          {destinationValid && <CheckCircle />}
          {!destinationValid && <Cancel />}
          {t('admin:components.project.destinationURLValid')}
        </div>

        {!(existingProject && changeDestination) && <div className={classNames({
          [styles.validContainer]: true,
          [styles.valid]: sourceValid,
          [styles.invalid]: !sourceValid
        })}>
          {sourceValid && <CheckCircle />}
          {!sourceValid && <Cancel />}
          {t('admin:components.project.sourceURLValid')}
        </div>}

        {!(existingProject && changeDestination) && <div className={classNames({
          [styles.validContainer]: true,
          [styles.valid]: sourceProjectMatchesDestination,
          [styles.invalid]: !sourceProjectMatchesDestination
        })}>
          {sourceProjectMatchesDestination && <CheckCircle />}
          {!sourceProjectMatchesDestination && <Cancel />}
          {t('admin:components.project.sourceMatchesDestination')}
        </div> }

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
