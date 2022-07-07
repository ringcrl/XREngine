import { defineAction } from '@xrengine/hyperflux'

import { matchesWeightsParameters } from '../../avatar/animation/Util'
import { ParityValue } from '../../common/enums/ParityValue'
import {
  matches,
  matchesNetworkId,
  matchesQuaternion,
  matchesUserId,
  matchesVector3,
  matchesWithDefault
} from '../../common/functions/MatchesUtils'
import { Engine } from '../../ecs/classes/Engine'
import { matchPose } from '../../transform/TransformInterfaces'
import { matchesAvatarProps } from '../interfaces/WorldState'

export class WorldNetworkAction {
  static setXRMode = defineAction({
    type: 'network.SET_XR_MODE',
    enabled: matches.boolean,
    avatarInputControllerType: matches.string,
    $cache: { removePrevious: true }
  })

  static xrHandsConnected = defineAction({
    type: 'network.XR_HANDS_CONNECTED',
    $cache: true
  })

  static spawnDebugPhysicsObject = defineAction({
    type: 'network.SPAWN_DEBUG_PHYSICS_OBJECT',
    config: matches.any.optional()
  })

  static spawnObject = defineAction({
    type: 'network.SPAWN_OBJECT',
    prefab: matches.string,
    networkId: matchesWithDefault(matchesNetworkId, () => Engine.instance.currentWorld.createNetworkId()),
    position: matchesVector3.optional(),
    rotation: matchesQuaternion.optional(),
    $cache: true
  })

  static spawnAvatar = defineAction({
    ...WorldNetworkAction.spawnObject.actionShape,
    prefab: 'avatar'
  })

  static spawnCamera = defineAction({
    ...WorldNetworkAction.spawnObject.actionShape,
    prefab: 'camera'
  })

  static destroyObject = defineAction({
    type: 'network.DESTROY_OBJECT',
    networkId: matchesNetworkId
  })

  static interact = defineAction({
    type: 'network.INTERACT',
    object: { ownerId: matchesUserId, networkId: matchesNetworkId },
    parity: matches.some(...Object.values(ParityValue).map((v) => matches.literal(v)))
  })

  static setEquippedObject = defineAction({
    type: 'network.SET_EQUIPPED_OBJECT',
    object: matches.shape({
      ownerId: matchesUserId,
      networkId: matchesNetworkId
    }),
    equip: matches.boolean,
    attachmentPoint: matches.number,
    $cache: true
  })

  static avatarAnimation = defineAction({
    type: 'network.AVATAR_ANIMATION',
    newStateName: matches.string,
    params: matchesWeightsParameters,
    $cache: {
      removePrevious: true
    }
  })

  static avatarDetails = defineAction({
    type: 'network.AVATAR_DETAILS',
    avatarDetail: matchesAvatarProps,
    $cache: {
      removePrevious: true
    }
  })

  static teleportObject = defineAction({
    type: 'network.TELEPORT_OBJECT',
    object: matches.shape({
      ownerId: matchesUserId,
      networkId: matchesNetworkId
    }),
    pose: matchPose
  })

  static requestAuthorityOverObject = defineAction({
    type: 'network.REQUEST_AUTHORITY_OVER_OBJECT',
    object: matches.shape({
      ownerId: matchesUserId,
      networkId: matchesNetworkId
    }),
    requester: matches.string
  })

  static transferAuthorityOfObject = defineAction({
    type: 'network.TRANSFER_AUTHORITY_OF_OBJECT',
    object: matches.shape({
      ownerId: matchesUserId,
      networkId: matchesNetworkId
    }),
    newAuthor: matches.string
  })

  static setUserTyping = defineAction({
    type: 'network.USER_IS_TYPING',
    typing: matches.boolean
  })
}
