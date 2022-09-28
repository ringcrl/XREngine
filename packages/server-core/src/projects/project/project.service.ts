import { Id, Params } from '@feathersjs/feathers'
import appRootPath from 'app-root-path'
import { compareVersions } from 'compare-versions'
import { iff, isProvider } from 'feathers-hooks-common'
import fs from 'fs'
import _ from 'lodash'
import { Octokit } from '@octokit/rest'
import path from 'path'

import { UserInterface } from '@xrengine/common/src/dbmodels/UserInterface'
import logger from '@xrengine/common/src/logger'

import { Application } from '../../../declarations'
import authenticate from '../../hooks/authenticate'
import projectPermissionAuthenticate from '../../hooks/project-permission-authenticate'
import verifyScope from '../../hooks/verify-scope'
import { getStorageProvider } from '../../media/storageprovider/storageprovider'
import { UserParams } from '../../user/user/user.class'
import {
  getOctokitForChecking,
  pushProjectToGithub
} from '../githubapp/githubapp-helper'
import {checkBuilderService, getEnginePackageJson, retriggerBuilderService} from './project-helper'
import { Project } from './project.class'
import projectDocs from './project.docs'
import hooks from './project.hooks'
import createModel from './project.model'
import {GITHUB_URL_REGEX} from "@xrengine/common/src/constants/GitHubConstants";
import { Forbidden } from "@feathersjs/errors";
import config from "../../appconfig";

const projectsRootFolder = path.join(appRootPath.path, 'packages/projects/projects/')
declare module '@xrengine/common/declarations' {
  interface ServiceTypes {
    projects: {
      find: () => ReturnType<typeof getProjectsList>
    }
    project: Project
    'project-build': any
    'project-invalidate': any
    'project-github-push': any
    'project-branches': any
    'project-tags': any,
    'project-destination-check': any
    'project-check-source-destination-match'
  }
  interface Models {
    project: ReturnType<typeof createModel>
  }
}

interface ProjectTagResponse {
  projectVersion: string
  engineVersion: string
  commitSHA: string
  matchesEngineVersion: boolean
}

/**
 * returns a list of projects installed by name from their folder names
 */
export const getProjectsList = async () => {
  return fs
    .readdirSync(projectsRootFolder)
    .filter((projectFolder) => fs.existsSync(path.join(projectsRootFolder, projectFolder, 'xrengine.config.ts')))
}

export default (app: Application): void => {
  const options = {
    Model: createModel(app),
    paginate: app.get('paginate'),
    multi: true
  }

  const projectClass = new Project(options, app)
  projectClass.docs = projectDocs

  app.use('project', projectClass)

  // TODO: move these to sub-methods of 'project' service

  app.use('projects', {
    find: getProjectsList
  })

  app.service('projects').hooks({
    before: {
      find: [authenticate()]
    }
  })

  app.use('project-build', {
    find: async (data, params) => {
      return await checkBuilderService(app)
    },
    patch: async ({ rebuild }, params) => {
      if (rebuild) {
        return await retriggerBuilderService(app)
      }
    }
  })

  app.use('project-invalidate', {
    patch: async ({ projectName, storageProviderName }, params) => {
      if (projectName) {
        return await getStorageProvider(storageProviderName).createInvalidation([`projects/${projectName}*`])
      }
    }
  })

  app.service('project-build').hooks({
    before: {
      find: [authenticate(), verifyScope('admin', 'admin')],
      patch: [authenticate(), verifyScope('admin', 'admin')]
    }
  })

  app.service('project-invalidate').hooks({
    before: {
      patch: [authenticate(), verifyScope('admin', 'admin')]
    }
  })

  app.use('project-check-source-destination-match', {
    find: async(params?: Params): Promise<any> => {
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
            console.log('getting destination package.json')
            const destinationPackage = await destinationOctoKit.request(`GET /repos/${destinationOwner}/${destinationRepo}/contents/package.json`)
            console.log('destinationPackage', destinationPackage)
            resolve(destinationPackage)
          } catch(err) {
            console.log('destination package fetch error', err)
            logger.error(err)
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
      console.log('source repo package.json', sourceContent, sourceContent.name)
      console.log('destination repo package.json', destinationContent, destinationContent.name)
      if (sourceContent.name.toLowerCase() !== destinationContent.name.toLowerCase())
        return {
          error: 'invalidRepoProjectName',
          text: 'The repository you are attempting to update from contains a different project than the one you are updating'
        }
      else return { sourceProjectMatchesDestination: true, projectName: sourceContent.name }
    }
  })

  app.service('project-check-source-destination-match').hooks({
    before: {
      find: [
        authenticate(),
        iff(isProvider('external'), verifyScope('projects', 'read') as any)
      ]
    }
  })

  app.use('project-github-push', {
    patch: async (id: Id, data: any, params?: UserParams): Promise<any> => {
      const project = await app.service('project').Model.findOne({
        where: {
          id
        }
      })
      return pushProjectToGithub(app, project, params!.user!)
    }
  })

  app.service('project-github-push').hooks({
    before: {
      patch: [
        authenticate(),
        iff(isProvider('external'), verifyScope('editor', 'write') as any),
        projectPermissionAuthenticate('write')
      ]
    }
  })

  app.use('project-destination-check', {
    get: async (url: string, params?: Params): Promise<any> => {
      const isPublicURL = params.query.isPublicURL
      const octokitResponse = await getOctokitForChecking(app, url, params!)
      if (octokitResponse.error) return octokitResponse
      const { owner, repo, octoKit } = octokitResponse

      try {
        const repoResponse = await octoKit.request(`GET /repos/${owner}/${repo}`)
        const returned = { destinationValid: isPublicURL ? (repoResponse.data.permissions.push || repoResponse.data.permissions.admin) : true }
        if (!returned.destinationValid) {
          returned.error = 'invalidPermission'
          returned.text = 'You do not have personal push or admin access to this repo. If the GitHub app associated with this deployment is installed in this repo, please select "Installed GitHub app" and then select it from the list that appears.'
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
  })

  app.service('project-destination-check').hooks({
    before: {
      get: [
        authenticate(),
        iff(isProvider('external'), verifyScope('projects', 'read') as any)
      ]
    }
  })

  app.use('project-branches', {
    get: async (url: string, params?: Params): Promise<any> => {
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
  })

  app.service('project-branches').hooks({
    before: {
      get: [
        authenticate(),
        iff(isProvider('external'), verifyScope('projects', 'read') as any)
      ]
    }
  })

  app.use('project-tags', {
    get: async (url: string, params?: Params): Promise<any> => {
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
  })

  app.service('project-tags').hooks({
    before: {
      get: [
        authenticate(),
        iff(isProvider('external'), verifyScope('projects', 'read') as any)
      ]
    }
  })

  const service = app.service('project')

  service.hooks(hooks)

  service.publish('patched', async (data: UserInterface, params): Promise<any> => {
    try {
      let targetIds = []
      const projectOwners = await app.service('project-permission').Model.findAll({
        where: {
          projectId: data.id
        }
      })
      targetIds = targetIds.concat(projectOwners.map((permission) => permission.userId))
      const admins = await app.service('user').Model.findAll({
        include: [
          {
            model: app.service('scope').Model,
            where: {
              type: 'admin:admin'
            }
          }
        ]
      })
      targetIds = targetIds.concat(admins.map((admin) => admin.id))
      targetIds = _.uniq(targetIds)
      return Promise.all(
        targetIds.map((userId: string) => {
          return app.channel(`userIds/${userId}`).send({
            project: data
          })
        })
      )
    } catch (err) {
      logger.error(err)
      throw err
    }
  })
}
