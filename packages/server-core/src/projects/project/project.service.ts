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
  createGitHubApp, getAppOctokit,
  getAuthenticatedRepo, getGitHubAppRepos, getInstallationOctokit,
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
    'project-tags': any
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

  app.use('project-branches', {
    get: async (url: string, params?: Params): Promise<any> => {
      const publicURL = params.query.publicURL
      const githubIdentityProvider = await app.service('identity-provider').Model.findOne({
        where: {
          userId: params!.user.id,
          type: 'github'
        }
      })
      if (publicURL && !githubIdentityProvider) throw new Forbidden('You must have a connected GitHub account to access public repos')
      let repoPath = await getAuthenticatedRepo(url)
      if (!repoPath) repoPath = url //public repo

      const githubPathRegexExec = GITHUB_URL_REGEX.exec(url)
      if (!githubPathRegexExec) return {
        error: 'invalidUrl',
        text: 'Project URL is not a valid GitHub URL, or the GitHub repo is private'
      }
      const split = githubPathRegexExec[1].split('/')
      if (!split[0] || !split[1]) return {
        error: 'invalidUrl',
        text: 'Project URL is not a valid GitHub URL, or the GitHub repo is private'
      }
      const owner = split[0]
      const repo = split[1].replace('.git', '')
      const repos = await getGitHubAppRepos()
      const octoKit = publicURL || githubIdentityProvider
          ? new Octokit({ auth: githubIdentityProvider.oauthToken })
          : await (async () => {
            await createGitHubApp()
            return getInstallationOctokit(
                repos.find((repo) => repo.repositoryPath === repoPath || repo.repositoryPath === repoPath + '.git')
            )
          })()

      try {
        const repoResponse = await octoKit.request(`GET /repos/${owner}/${repo}`)
        const returnedBranches = [{ name: repoResponse.data.default_branch, isMain: true }]
        const deploymentBranch = `${config.server.releaseName}-deployment`
        try {
          console.log('deploymentBranch', deploymentBranch)
          await octoKit.request(`GET /repos/${owner}/${repo}/branches/${deploymentBranch}`)
          console.log('deployment branch exists')
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
      const publicURL = params.query.publicURL
      const githubIdentityProvider = await app.service('identity-provider').Model.findOne({
        where: {
          userId: params!.user.id,
          type: 'github'
        }
      })
      if (publicURL && !githubIdentityProvider) throw new Forbidden('You must have a connected GitHub account to access public repos')
      let repoPath = await getAuthenticatedRepo(url)
      if (!repoPath) repoPath = url //public repo

      const githubPathRegexExec = GITHUB_URL_REGEX.exec(url)
      if (!githubPathRegexExec) return {
        error: 'invalidUrl',
        text: 'Project URL is not a valid GitHub URL, or the GitHub repo is private'
      }
      const split = githubPathRegexExec[1].split('/')
      if (!split[0] || !split[1]) return {
        error: 'invalidUrl',
        text: 'Project URL is not a valid GitHub URL, or the GitHub repo is private'
      }
      const owner = split[0]
      const repo = split[1].replace('.git', '')
      const repos = await getGitHubAppRepos()
      const octoKit = publicURL || githubIdentityProvider
          ? new Octokit({ auth: githubIdentityProvider.oauthToken })
          : await (async () => {
            await createGitHubApp()
            return getInstallationOctokit(
                repos.find((repo) => repo.repositoryPath === repoPath || repo.repositoryPath === repoPath + '.git')
            )
          })()
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
        if (!headIsTagged) {
          const headContent = await octoKit.request(`GET /repos/${owner}/${repo}/contents/package.json`)
          const content = JSON.parse(Buffer.from(headContent.data.content, 'base64').toString())
          tagDetails = tagDetails.sort((a, b) => compareVersions(b.projectVersion, a.projectVersion))
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
