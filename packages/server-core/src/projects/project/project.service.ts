import { Id, Params } from '@feathersjs/feathers'
import appRootPath from 'app-root-path'
import { iff, isProvider } from 'feathers-hooks-common'
import fs from 'fs'
import _ from 'lodash'
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
  pushProjectToGithub
} from '../githubapp/githubapp-helper'
import {
  checkBuilderService,
  checkDestination,
  checkProjectDestinationMatch, findBuilderTags,
  getBranches,
  getTags,
  updateBuilder
} from './project-helper'
import { Project } from './project.class'
import projectDocs from './project.docs'
import hooks from './project.hooks'
import createModel from './project.model'

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
    'project-builder-tags': any
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
    patch: async (tag: string, params) => {
      return await updateBuilder(app, tag)
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
      return checkProjectDestinationMatch(app, params)
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
      return checkDestination(app, url, params)
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
      return getBranches(app, url, params)
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
      return getTags(app, url, params)
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

  app.use('project-builder-tags', {
    find: async (params?: Params): Promise<any> => {
      return findBuilderTags(app, params)
    }
  })

  app.service('project-builder-tags').hooks({
    before: {
      find: [
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
