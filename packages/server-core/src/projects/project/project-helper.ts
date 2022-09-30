import appRootPath from 'app-root-path'
import axios from 'axios'
import AWS from 'aws-sdk'
import path from 'path'

import { ProjectPackageJsonType } from '@xrengine/common/src/interfaces/ProjectInterface'
import { ProjectConfigInterface, ProjectEventHooks } from '@xrengine/projects/ProjectConfigInterface'

import { Application } from '../../../declarations'
import config from '../../appconfig'
import { getStorageProvider } from '../../media/storageprovider/storageprovider'
import logger from '../../ServerLogger'
import {getOctokitForChecking} from "../githubapp/githubapp-helper";
import {Params} from "@feathersjs/feathers";
import {compareVersions} from "compare-versions";

const publicECRRegex = /^public.ecr.aws\/[a-zA-Z0-9]+\/([\w\d\s\-_]+)$/
const privateECRRegex = /^[a-zA-Z0-9]+.dkr.ecr.([\w\d\s\-_]+).amazonaws.com/

export const updateBuilder = async (app: Application, tag, storageProviderName?: string) => {
  try {
    // invalidate cache for all installed projects
    await getStorageProvider(storageProviderName).createInvalidation(['projects*'])
  } catch (e) {
    logger.error(e, `[Project Rebuild]: Failed to invalidate cache with error: ${e.message}`)
  }

  console.log('builderRepo', process.env.BUILDER_REPOSITORY)
  console.log('tag', tag)
  // trigger k8s to re-run the builder service
  if (app.k8AppsClient) {
    try {
      logger.info('Attempting to update builder tag')
      const builderRepo = process.env.BUILDER_REPOSITORY
      const updateBuilderTagResponse = await app.k8AppsClient.patchNamespacedDeployment(
        `${config.server.releaseName}-builder-xrengine-builder`,
        'default',
        {
          spec: {
            template: {
              containers: {
                'xrengine-builder': {
                  Image: `${builderRepo}/${tag}`
                }
              }
            }
          }
        },
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: {
            'Content-Type': 'application/strategic-merge-patch+json'
          }
        }
      )
      logger.info(updateBuilderTagResponse, 'updateBuilderTagResponse')
      return updateBuilderTagResponse
    } catch (e) {
      logger.error(e)
      return e
    }
  }
}

export const checkBuilderService = async (app: Application): Promise<boolean> => {
  let isRebuilding = true

  // check k8s to find the status of builder service
  if (app.k8DefaultClient) {
    try {
      logger.info('Attempting to check k8s rebuild status')

      const builderLabelSelector = `app.kubernetes.io/instance=${config.server.releaseName}-builder`
      const containerName = 'xrengine-builder'

      const builderPods = await app.k8DefaultClient.listNamespacedPod(
        'default',
        undefined,
        false,
        undefined,
        undefined,
        builderLabelSelector
      )
      const runningBuilderPods = builderPods.body.items.filter((item) => item.status && item.status.phase === 'Running')

      if (runningBuilderPods.length > 0) {
        const podName = runningBuilderPods[0].metadata?.name

        const builderLogs = await app.k8DefaultClient.readNamespacedPodLog(
          podName!,
          'default',
          containerName,
          undefined,
          false,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined
        )

        const isCompleted = builderLogs.body.includes('sleep infinity')
        if (isCompleted) {
          logger.info(podName, 'podName')
          isRebuilding = false
        }
      }
    } catch (e) {
      logger.error(e)
      return e
    }
  } else {
    isRebuilding = false
  }

  return isRebuilding
}

const projectsRootFolder = path.join(appRootPath.path, 'packages/projects/projects/')

export const onProjectEvent = async (
  app: Application,
  projectName: string,
  hookPath: string,
  eventType: keyof ProjectEventHooks
) => {
  const hooks = require(path.resolve(projectsRootFolder, projectName, hookPath)).default
  if (typeof hooks[eventType] === 'function') await hooks[eventType](app)
}

export const getProjectConfig = async (projectName: string): Promise<ProjectConfigInterface> => {
  try {
    return (await import(`@xrengine/projects/projects/${projectName}/xrengine.config.ts`)).default
  } catch (e) {
    logger.error(
      e,
      '[Projects]: WARNING project with ' +
        `name ${projectName} has no xrengine.config.ts file - this is not recommended.`
    )
    return null!
  }
}

export const getProjectPackageJson = (projectName: string): ProjectPackageJsonType => {
  return require(path.resolve(projectsRootFolder, projectName, 'package.json'))
}

export const getEnginePackageJson = (): ProjectPackageJsonType => {
  return require(path.resolve(appRootPath.path, 'packages/server-core/package.json'))
}

export const getProjectEnv = async (app: Application, projectName: string) => {
  const projectSetting = await app.service('project-setting').find({
    query: {
      $limit: 1,
      name: projectName,
      $select: ['settings']
    }
  })
  const settings = {} as { [key: string]: string }
  Object.values(projectSetting).map(({ key, value }) => (settings[key] = value))
  return settings
}

export const checkProjectDestinationMatch = async(app: Application, params?: Params) => {
  const { sourceURL, destinationURL, sourceIsPublicURL, destinationIsPublicURL, existingProject }: { sourceURL: string, destinationURL: string, sourceIsPublicURL: boolean, destinationIsPublicURL: boolean, existingProject?: boolean } = params.query
  const { owner: destinationOwner, repo: destinationRepo, octoKit: destinationOctoKit } = await getOctokitForChecking(app, destinationURL, {...params, query: {isPublicURL: destinationIsPublicURL}} as Params)
  const { owner: sourceOwner, repo: sourceRepo, octoKit: sourceOctoKit } = await getOctokitForChecking(app, sourceURL, {...params, query: {isPublicURL: sourceIsPublicURL}} as Params)

  const [sourceBlobResponse, destinationBlobResponse] = await Promise.all([
    new Promise(async (resolve, reject) => {
      try {
        console.log('Getting source package.json')
        const sourcePackage = await sourceOctoKit.request(`GET /repos/${sourceOwner}/${sourceRepo}/contents/package.json`)
        console.log('sourcePackage', sourcePackage)
        resolve(sourcePackage)
      } catch(err) {
        logger.error(err)
        if (err.status === 404) {
          resolve( {
            error: 'sourcePackageMissing',
            text: 'There is no package.json in the source repo'
          })
        } else reject(err)
      }
    }),
    new Promise(async (resolve, reject) => {
      try {
        const destinationPackage = await destinationOctoKit.request(`GET /repos/${destinationOwner}/${destinationRepo}/contents/package.json`)
        resolve(destinationPackage)
      } catch(err) {
        logger.error('destination package fetch error', err)
        if (err.status === 404) {
          resolve({
            error: 'destinationPackageMissing',
            text: 'There is no package.json in the source repo'
          })
        } else reject(err)
      }
    }),
  ])
  if (sourceBlobResponse.error) return sourceBlobResponse
  const sourceContent = JSON.parse(Buffer.from(sourceBlobResponse.data.content, 'base64').toString())
  if (!existingProject) {
    const projectExists = await app.service('project').find({
      name: sourceContent.name
    })
    if (projectExists.total > 0) return {
      sourceProjectMatchesDestination: false,
      error: 'projectExists',
      text: 'The source project is already installed'
    }
  }
  if (destinationBlobResponse.error && destinationBlobResponse.error !== 'destinationPackageMissing') return destinationBlobResponse
  if (destinationBlobResponse.error === 'destinationPackageMissing') return { sourceProjectMatchesDestination: true, projectName: sourceContent.name }
  const destinationContent = JSON.parse(Buffer.from(destinationBlobResponse.data.content, 'base64').toString())
  if (sourceContent.name.toLowerCase() !== destinationContent.name.toLowerCase())
    return {
      error: 'invalidRepoProjectName',
      text: 'The repository you are attempting to update from contains a different project than the one you are updating'
    }
  else return { sourceProjectMatchesDestination: true, projectName: sourceContent.name }
}

export const checkDestination = async(app: Application, url: string, params?: Params) => {
  const isPublicURL = params.query.isPublicURL
  const inputProjectURL = params.query.inputProjectURL
  const octokitResponse = await getOctokitForChecking(app, url, params!)
  if (octokitResponse.error) return octokitResponse
  const { owner, repo, octoKit } = octokitResponse

  try {
    const repoResponse = await octoKit.request(`GET /repos/${owner}/${repo}`)
    let destinationPackage
    try {
      destinationPackage = await octoKit.request(`GET /repos/${owner}/${repo}/contents/package.json`)
    } catch(err) {
      logger.error('destination package fetch error', err)
      if (err.status !== 404) throw err
    }
    const returned = { destinationValid: isPublicURL ? (repoResponse.data.permissions.push || repoResponse.data.permissions.admin) : true }
    if (destinationPackage)
      returned.projectName = JSON.parse(Buffer.from(destinationPackage.data.content, 'base64').toString()).name
    else
      returned.repoEmpty = true
    if (!returned.destinationValid) {
      returned.error = 'invalidPermission'
      returned.text = 'You do not have personal push or admin access to this repo. If the GitHub app associated with this deployment is installed in this repo, please select "Installed GitHub app" and then select it from the list that appears.'
    }

    if (inputProjectURL?.length > 0) {
      const projectOctokitResponse = await getOctokitForChecking(app, inputProjectURL, params!)
      const { owner: existingOwner, repo: existingRepo, octoKit: projectOctoKit } = projectOctokitResponse
      let existingProjectPackage
      try {
        existingProjectPackage = await projectOctoKit.request(`GET /repos/${existingOwner}/${existingRepo}/contents/package.json`)
        const existingProjectName = JSON.parse(Buffer.from(existingProjectPackage.data.content, 'base64').toString()).name
        if (!returned.repoEmpty && (existingProjectName !== returned.projectName)) {
          returned.error = 'mismatchedProjects'
          returned.text = `The new destination repo contains project '${returned.projectName}', which is different than the current project '${existingProjectName}'`
        }
      } catch(err) {
        logger.error('destination package fetch error', err)
        if (err.status !== 404) throw err
      }
    }
    return returned
  } catch(err) {
    logger.error('error checking destination URL %o', err)
    if (err.status === 404) return {
      error: 'invalidUrl',
      text: 'Project URL is not a valid GitHub URL, or the GitHub repo is private'
    }
    throw err
  }
}

export const getBranches = async(app: Application, url: string, params?: Params) => {
  const octokitResponse = await getOctokitForChecking(app, url, params!)
  if (octokitResponse.error) return octokitResponse
  const { owner, repo, octoKit } = octokitResponse

  try {
    const repoResponse = await octoKit.request(`GET /repos/${owner}/${repo}`)
    const returnedBranches = [{ name: repoResponse.data.default_branch, isMain: true }]
    const deploymentBranch = `${config.server.releaseName}-deployment`
    try {
      await octoKit.request(`GET /repos/${owner}/${repo}/branches/${deploymentBranch}`)
      returnedBranches.push({
        name: deploymentBranch,
        isMain: false
      })
    } catch(err) {
      logger.error(err)
    }
    return returnedBranches
  } catch(err) {
    logger.error('error getting branches for project %o', err)
    if (err.status === 404) return {
      error: 'invalidUrl',
      text: 'Project URL is not a valid GitHub URL, or the GitHub repo is private'
    }
    throw err
  }
}

export const getTags = async(app: Application, url: string, params?: Params) => {
  const octokitResponse = await getOctokitForChecking(app, url, params!)
  if (octokitResponse.error) return octokitResponse
  const { owner, repo, octoKit } = octokitResponse

  try {
    let headIsTagged = false
    const enginePackageJson = getEnginePackageJson()
    const repoResponse = await octoKit.request(`GET /repos/${owner}/${repo}`)
    const branchName = params.query.branchName || repoResponse.default_branch
    const [headResponse, tagResponse] = await Promise.all([
      octoKit.request(`GET /repos/${owner}/${repo}/commits`, {
        sha: branchName
      }),
      octoKit.request(`GET /repos/${owner}/${repo}/tags`, {
        sha: branchName
      })
    ])
    const commits = headResponse.data.map(commit => commit.sha)
    const matchingTags = tagResponse.data.filter(tag => commits.indexOf(tag.commit.sha) > -1)
    let tagDetails = await Promise.all(matchingTags.map(tag => new Promise(async (resolve, reject): Promise<ProjectTagResponse> => {
      try {
        if (tag.commit.sha === headResponse.data[0].sha) headIsTagged = true
        const blobResponse = await octoKit.request(`GET /repos/${owner}/${repo}/contents/package.json`, {
          ref: tag.name
        })
        const content = JSON.parse(Buffer.from(blobResponse.data.content, 'base64').toString())
        resolve({
          projectName: content.name,
          projectVersion: tag.name,
          engineVersion: content.etherealEngine?.version,
          commitSHA: tag.commit.sha,
          matchesEngineVersion: content.etherealEngine?.version ? compareVersions(content.etherealEngine?.version, enginePackageJson.version || '0.0.0') === 0 : false
        })
      } catch(err) {
        logger.error('Error getting tagged package.json %s/%s:%s %o', owner, repo, tag.name, err)
        reject(err)
      }
    }))) as ProjectTagResponse[]
    tagDetails = tagDetails.sort((a, b) => compareVersions(b.projectVersion, a.projectVersion))
    if (!headIsTagged) {
      const headContent = await octoKit.request(`GET /repos/${owner}/${repo}/contents/package.json`)
      const content = JSON.parse(Buffer.from(headContent.data.content, 'base64').toString())
      tagDetails.unshift({
        projectName: content.name,
        projectVersion: '{Latest commit}',
        engineVersion: content.etherealEngine?.version,
        commitSHA: headResponse.data[0].sha,
        matchesEngineVersion: content.etherealEngine?.version ? compareVersions(content.etherealEngine?.version, enginePackageJson.version || '0.0.0') === 0 : false
      })
    }
    return tagDetails
  } catch(err) {
    logger.error('error getting repo tags %o', err)
    if (err.status === 404) return {
      error: 'invalidUrl',
      text: 'Project URL is not a valid GitHub URL, or the GitHub repo is private'
    }
    else if (err.status === 409) return {
      error: 'repoEmpty',
      text: 'This repo is empty'
    }
    throw err
  }
}


export const findBuilderTags = async(app: Application, params?: Params) => {
  const builderRepo = process.env.BUILDER_REPOSITORY
  const publicECRExec = publicECRRegex.exec(builderRepo)
  const privateECRExec = privateECRRegex.exec(builderRepo)
  if (publicECRExec) {
    const ecr = new AWS.ECRPUBLIC({
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET,
      region: 'us-east-1'
    })
    const result = await ecr.describeImages({
      repositoryName: publicECRExec[1]
    }).promise()
    return result.imageDetails.sort((a, b) => b.imagePushedAt - a.imagePushedAt).map(imageDetails => {
      const tag = imageDetails.imageTags.find(tag => !/latest/.test(tag))
      const tagSplit = tag.split('-')
      return {
        commitSHA: tagSplit.length === 1 ? tagSplit[0] : tagSplit[1],
        engineVersion: tagSplit.length === 1 ? 'unknown' : tagSplit[0],
        pushedAt: imageDetails.imagePushedAt.toJSON()
      }
    })
  } else if (privateECRExec) {
    const ecr = new AWS.ECR({
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET,
      region: privateECRExec[1]
    })
    const result = await ecr.describeImages({
      repositoryName: privateECRRegex[2]
    }).promise()
    return result.imageDetails.sort((a, b) => b.imagePushedAt - a.imagePushedAt).map(imageDetails => {
      const tag = imageDetails.imageTags.find(tag => !/latest/.test(tag))
      const tagSplit = tag.split('-')
      return {
        commitSHA: tagSplit.length === 1 ? tagSplit[0] : tagSplit[1],
        engineVersion: tagSplit.length === 1 ? 'unknown' : tagSplit[0],
        pushedAt: imageDetails.imagePushedAt.toJSON()
      }
    })
  } else {
    const repoSplit = builderRepo.split('/')
    const registry = repoSplit.length === 1 ? 'lagunalabs' : repoSplit[0]
    const repo = repoSplit.length === 1 ? repoSplit[0] : repoSplit[1]
    const result = await axios.get(`https://registry.hub.docker.com/v2/repositories/${registry}/${repo}/tags?page_size=100`)
    return result.data.results.map(imageDetails => {
      const tag = imageDetails.name
      const tagSplit = tag.split('-')
      return {
        tag,
        commitSHA: tagSplit.length === 1 ? tagSplit[0] : tagSplit[1],
        engineVersion: tagSplit.length === 1 ? 'unknown' : tagSplit[0],
        pushedAt: new Date(imageDetails.tag_last_pushed).toJSON()
      }
    })
  }
}