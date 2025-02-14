import { TypedArray } from 'bitecs'
import { Quaternion, Vector3 } from 'three'

import { NetworkId } from '@xrengine/common/src/interfaces/NetworkId'
import { PeerID } from '@xrengine/common/src/interfaces/PeerID'
import { UserId } from '@xrengine/common/src/interfaces/UserId'

import { AvatarComponent } from '../../avatar/components/AvatarComponent'
import { AvatarLeftHandIKComponent, AvatarRightHandIKComponent } from '../../avatar/components/AvatarIKComponents'
import { AvatarHeadIKComponent } from '../../avatar/components/AvatarIKComponents'
import { Entity, UndefinedEntity } from '../../ecs/classes/Entity'
import { World } from '../../ecs/classes/World'
import { addComponent, getComponent, hasComponent, removeComponent } from '../../ecs/functions/ComponentFunctions'
import { RigidBodyComponent } from '../../physics/components/RigidBodyComponent'
import { NameComponent } from '../../scene/components/NameComponent'
import { TransformComponent } from '../../transform/components/TransformComponent'
import { XRHandsInputComponent } from '../../xr/XRComponents'
import { XRHandBones } from '../../xr/XRHandBones'
import { Network } from '../classes/Network'
import { NetworkObjectAuthorityTag } from '../components/NetworkObjectComponent'
import { expand, QUAT_MAX_RANGE, QUAT_PRECISION_MULT, VEC3_MAX_RANGE, VEC3_PRECISION_MULT } from './Utils'
import { flatten, Vector3SoA, Vector4SoA } from './Utils'
import {
  createViewCursor,
  readInt16,
  readProp,
  readUint8,
  readUint16,
  readUint32,
  readUint64,
  scrollViewCursor,
  ViewCursor
} from './ViewCursor'

export const checkBitflag = (mask: number, flag: number) => (mask & flag) === flag

/**
 * Reads a component dynamically
 * (less efficient than statically due to inner loop)
 *
 * @param  {any} component
 */
export const readComponent = (component: any) => {
  // todo: test performance of using flatten in the inner scope vs outer scope
  const props = flatten(component)

  const readChanged =
    props.length <= 8 ? readUint8 : props.length <= 16 ? readUint16 : props.length <= 32 ? readUint32 : readUint64

  return (v: ViewCursor, entity: Entity) => {
    const changeMask = readChanged(v)

    for (let i = 0; i < props.length; i++) {
      // skip reading property if not in the change mask
      if (!checkBitflag(changeMask, 2 ** i)) {
        continue
      }
      const prop = props[i]
      const val = readProp(v, prop)
      prop[entity] = val
    }
  }
}

export const readComponentProp = (v: ViewCursor, prop: TypedArray, entity: Entity) => {
  if (entity) prop[entity] = readProp(v, prop)
  else readProp(v, prop)
}

export const readVector3 = (vector3: Vector3SoA) => (v: ViewCursor, entity: Entity) => {
  const changeMask = readUint8(v)
  let b = 0
  if (checkBitflag(changeMask, 1 << b++)) readComponentProp(v, vector3.x, entity)
  if (checkBitflag(changeMask, 1 << b++)) readComponentProp(v, vector3.y, entity)
  if (checkBitflag(changeMask, 1 << b++)) readComponentProp(v, vector3.z, entity)
}

// Reads a compressed Vector3 from the DataView. This must have been previously written
// with writeCompressedVector3() in order to be properly decompressed.
export const readCompressedVector3 = (vector3: Vector3SoA) => (v: ViewCursor, entity: Entity) => {
  const changeMask = readUint8(v)
  if (changeMask <= 0) return

  let compressedBinaryData = readUint32(v)

  let z = expand(compressedBinaryData, 10)
  compressedBinaryData = compressedBinaryData >>> 10
  let y = expand(compressedBinaryData, 10)
  compressedBinaryData = compressedBinaryData >>> 10
  let x = expand(compressedBinaryData, 10)
  compressedBinaryData = compressedBinaryData >>> 10

  let offset_mult = 1
  if (entity && hasComponent(entity, AvatarComponent)) offset_mult = 100

  x /= VEC3_MAX_RANGE * VEC3_PRECISION_MULT * offset_mult
  y /= VEC3_MAX_RANGE * VEC3_PRECISION_MULT * offset_mult
  z /= VEC3_MAX_RANGE * VEC3_PRECISION_MULT * offset_mult

  if (entity) {
    vector3.x[entity] = x
    vector3.y[entity] = y
    vector3.z[entity] = z
  } else {
    // readComponentProp(v, vector3.x, entity)
    // readComponentProp(v, vector3.y, entity)
    // readComponentProp(v, vector3.z, entity)
  }
}

export const readVector4 = (vector4: Vector4SoA) => (v: ViewCursor, entity: Entity) => {
  const changeMask = readUint8(v)
  let b = 0
  if (checkBitflag(changeMask, 1 << b++)) readComponentProp(v, vector4.x, entity)
  if (checkBitflag(changeMask, 1 << b++)) readComponentProp(v, vector4.y, entity)
  if (checkBitflag(changeMask, 1 << b++)) readComponentProp(v, vector4.z, entity)
  if (checkBitflag(changeMask, 1 << b++)) readComponentProp(v, vector4.w, entity)
}

// Reads a compressed rotation value from the DataView. This value must have been previously written
// with WriteCompressedRotation() in order to be properly decompressed.
export const readCompressedRotation = (vector4: Vector4SoA) => (v: ViewCursor, entity: Entity) => {
  const changeMask = readUint8(v)
  if (changeMask <= 0) return

  let compressedBinaryData = readUint32(v)

  // Read the other three fields and derive the value of the omitted field
  let c = expand(compressedBinaryData, 10)
  compressedBinaryData = compressedBinaryData >>> 10
  let b = expand(compressedBinaryData, 10)
  compressedBinaryData = compressedBinaryData >>> 10
  let a = expand(compressedBinaryData, 10)
  compressedBinaryData = compressedBinaryData >>> 10

  const bitMaskForMaxIndex = 0b00000000000000000000000000000011
  let maxIndex = compressedBinaryData & bitMaskForMaxIndex

  a /= QUAT_MAX_RANGE * QUAT_PRECISION_MULT
  b /= QUAT_MAX_RANGE * QUAT_PRECISION_MULT
  c /= QUAT_MAX_RANGE * QUAT_PRECISION_MULT
  let d = Math.sqrt(1 - (a * a + b * b + c * c))

  let x, y, z, w
  if (maxIndex === 0) {
    x = d
    y = a
    z = b
    w = c
  } else if (maxIndex === 1) {
    x = a
    y = d
    z = b
    w = c
  } else if (maxIndex === 2) {
    x = a
    y = b
    z = d
    w = c
  } else {
    x = a
    y = b
    z = c
    w = d
  }

  if (entity) {
    vector4.x[entity] = x
    vector4.y[entity] = y
    vector4.z[entity] = z
    vector4.w[entity] = w
  } else {
    // readComponentProp(v, vector4.x, entity)
    // readComponentProp(v, vector4.y, entity)
    // readComponentProp(v, vector4.z, entity)
    // readComponentProp(v, vector4.w, entity)
  }
}

export const readPosition = readVector3(TransformComponent.position)
export const readRotation = readCompressedRotation(TransformComponent.rotation) //readVector4(TransformComponent.rotation)

export const readBodyPosition = readVector3(RigidBodyComponent.position)
export const readBodyRotation = readCompressedRotation(RigidBodyComponent.rotation)
export const readBodyLinearVelocity = readVector3(RigidBodyComponent.linearVelocity)
export const readBodyAngularVelocity = readVector3(RigidBodyComponent.angularVelocity)

export const readTransform = (v: ViewCursor, entity: Entity, dirtyTransforms: Set<Entity>) => {
  const changeMask = readUint8(v)
  let b = 0
  if (checkBitflag(changeMask, 1 << b++)) readPosition(v, entity)
  if (checkBitflag(changeMask, 1 << b++)) readRotation(v, entity)
  if (entity) {
    dirtyTransforms.add(entity)
  }
}

export const readRigidBody = (v: ViewCursor, entity: Entity) => {
  const changeMask = readUint8(v)
  let b = 0
  if (checkBitflag(changeMask, 1 << b++)) readBodyPosition(v, entity)
  if (checkBitflag(changeMask, 1 << b++)) readBodyRotation(v, entity)
  if (checkBitflag(changeMask, 1 << b++)) readBodyLinearVelocity(v, entity)
  if (checkBitflag(changeMask, 1 << b++)) readBodyAngularVelocity(v, entity)
  if (hasComponent(entity, RigidBodyComponent)) {
    const rigidBody = getComponent(entity, RigidBodyComponent)
    const body = rigidBody.body
    body.setTranslation(rigidBody.position, true)
    body.setRotation(rigidBody.rotation, true)
    body.setLinvel(rigidBody.linearVelocity, true)
    body.setAngvel(rigidBody.angularVelocity, true)
  }
}

export const readXRHeadPosition = readVector3(AvatarHeadIKComponent.target.position)
export const readXRHeadRotation = readCompressedRotation(AvatarHeadIKComponent.target.quaternion)

export const readXRControllerLeftPosition = readVector3(AvatarLeftHandIKComponent.target.position)
export const readXRControllerLeftRotation = readCompressedRotation(AvatarLeftHandIKComponent.target.quaternion)

export const readXRControllerRightPosition = readVector3(AvatarRightHandIKComponent.target.position)
export const readXRControllerRightRotation = readCompressedRotation(AvatarRightHandIKComponent.target.quaternion)

export const readXRHead = (v: ViewCursor, entity: Entity) => {
  const changeMask = readUint16(v)
  let b = 0
  if (checkBitflag(changeMask, 1 << b++)) readXRHeadPosition(v, entity)
  if (checkBitflag(changeMask, 1 << b++)) readXRHeadRotation(v, entity)
}

export const readXRLeftHand = (v: ViewCursor, entity: Entity) => {
  const changeMask = readUint16(v)
  let b = 0
  if (checkBitflag(changeMask, 1 << b++)) readXRControllerLeftPosition(v, entity)
  if (checkBitflag(changeMask, 1 << b++)) readXRControllerLeftRotation(v, entity)
}

export const readXRRightHand = (v: ViewCursor, entity: Entity) => {
  const changeMask = readUint16(v)
  let b = 0
  if (checkBitflag(changeMask, 1 << b++)) readXRControllerRightPosition(v, entity)
  if (checkBitflag(changeMask, 1 << b++)) readXRControllerRightRotation(v, entity)
}

/** @deprecated */
export const readXRHandBoneJoints = (v: ViewCursor, entity: Entity, handedness: string, bone: string[]) => {
  const changeMask = readUint16(v)
  let b = 0

  bone.forEach((jointName) => {
    if (checkBitflag(changeMask, 1 << b++)) {
      readVector3(XRHandsInputComponent[handedness][jointName].position)(v, entity)
    }
    if (checkBitflag(changeMask, 1 << b++)) {
      readCompressedRotation(XRHandsInputComponent[handedness][jointName].quaternion)(v, entity)
    }
  })
}
/** @deprecated */
export const readXRHandBones = (v: ViewCursor, entity: Entity) => {
  const changeMask = readUint16(v)
  const handednessBitValue = readUint8(v)
  let b = 0

  const handedness = handednessBitValue === 0 ? 'left' : 'right'

  XRHandBones.forEach((bone) => {
    if (checkBitflag(changeMask, 1 << b++)) readXRHandBoneJoints(v, entity, handedness, bone)
  })
}
/** @deprecated */
export const readXRHands = (v: ViewCursor, entity: Entity) => {
  const changeMask = readUint16(v)
  let b = 0

  for (let i = 0; i < 2; i++) {
    if (checkBitflag(changeMask, 1 << b++)) readXRHandBones(v, entity)
  }
}

export const readEntity = (v: ViewCursor, world: World, fromUserId: UserId) => {
  const netId = readUint32(v) as NetworkId
  const changeMask = readUint8(v)

  let entity = world.getNetworkObject(fromUserId, netId)
  if (entity && hasComponent(entity, NetworkObjectAuthorityTag)) entity = UndefinedEntity

  let b = 0
  if (checkBitflag(changeMask, 1 << b++)) readTransform(v, entity, world.dirtyTransforms)
  if (checkBitflag(changeMask, 1 << b++)) readRigidBody(v, entity)
  if (checkBitflag(changeMask, 1 << b++)) readXRHead(v, entity)
  if (checkBitflag(changeMask, 1 << b++)) readXRLeftHand(v, entity)
  if (checkBitflag(changeMask, 1 << b++)) readXRRightHand(v, entity)
  // if (checkBitflag(changeMask, 1 << b++)) readXRHands(v, entity)
}

export const readEntities = (v: ViewCursor, world: World, byteLength: number, fromUserID: UserId) => {
  while (v.cursor < byteLength) {
    const count = readUint32(v)
    for (let i = 0; i < count; i++) {
      readEntity(v, world, fromUserID)
    }
  }
}

export const readMetadata = (v: ViewCursor, world: World) => {
  const userIndex = readUint32(v)
  const peerIndex = readUint32(v)
  const fixedTick = readUint32(v)
  // if (userIndex === world.peerIDToUserIndex.get(world.worldNetwork.hostId)! && !world.worldNetwork.isHosting) world.fixedTick = fixedTick
  return { userIndex, peerIndex }
}

export const createDataReader = () => {
  return (world: World, network: Network, packet: ArrayBuffer) => {
    const view = createViewCursor(packet)
    const { userIndex, peerIndex } = readMetadata(view, world)
    const fromUserID = network.userIndexToUserID.get(userIndex)
    const fromPeerID = network.peerIndexToPeerID.get(peerIndex)
    const isLoopback = fromPeerID && fromPeerID === network.peerID
    if (fromUserID && !isLoopback) readEntities(view, world, packet.byteLength, fromUserID)
  }
}
