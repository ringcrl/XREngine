import React, { useCallback, useState } from 'react'
import SketchPicker from 'react-color/lib/Sketch'
import styled from 'styled-components'
import { Color } from 'three'

import Popover from '@mui/material/Popover'

import Input from './Input'

function toHex(str) {
  const arr1 = [] as any[]
  for (var n = 0, l = str.length; n < l; n++) {
    var hex = Number(str.charCodeAt(n)).toString(16)
    arr1.push(hex)
  }
  return arr1.join('')
}

/**
 * ColorInputContainer used to provide styles for ColorInputContainer div.
 *
 * @type {styled component}
 */
const ColorInputContainer = (styled as any).div`
  display: flex;
  position: relative;
  width: 100%;
  max-width: 100px;
`

/**
 * StyledColorInput used to provide styles for StyledColorInput div.
 *
 * @type {styled component}
 */
const StyledColorInput = (styled as any)(Input)`
  display: flex;
  flex: 1;
  align-items: center;
  &:focus-visible { outline: none; }
`

/**
 * ColorPreview used to provide styles for ColorPreview div.
 *
 * @type {styled component}
 */
const ColorPreview = (styled as any).div`
  width: 32px;
  height: auto;
  border-radius: 2px;
  padding: 6px;
  margin-right: 8px;
`

/**
 * ColorText used to provide styles for ColorText div.
 *
 * @type {styled component}
 */
const ColorText = (styled as any).div`
  padding-top: 2px;
`

/**
 * ColorInputPopover used to provide styles for ColorText popover.
 *
 * @type {styled component}
 */
const ColorInputPopover = (styled as any).div`
  box-shadow: var(--shadow30);
  margin-bottom: 3px;
`

interface ColorInputProp {
  value: Color
  onChange: Function
  onSelect?: Function
  disabled?: boolean
  isValueAsInteger?: boolean
}

/**
 * ColorInput used to render the view of component.
 *
 * @param       {object | number} value
 * @param       {Function} onChange
 * @param       {boolean} disabled
 * @param       {any} rest
 * @constructor
 */

export function ColorInput({ value, onChange, onSelect, disabled, ...rest }: ColorInputProp) {
  const onChangePicker = useCallback(
    ({ hex }) => {
      value.set(hex)
      if (onSelect) onSelect(new Color(hex))
    },
    [onChange]
  )

  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)

  const handlePopoverOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handlePopoverClose = () => {
    onChange(value)
    setAnchorEl(null)
  }

  const open = Boolean(anchorEl)

  //initializing hexColor by getting hexString
  const hexColor = '#' + value.getHexString()

  //creating view for ColorInput
  return (
    <ColorInputContainer>
      <StyledColorInput as="button" disabled={disabled} onClick={handlePopoverOpen}>
        <ColorPreview style={{ background: hexColor }} />
        <ColorText>{hexColor.toUpperCase()}</ColorText>
      </StyledColorInput>
      <Popover open={open && !disabled} anchorEl={anchorEl} onClose={handlePopoverClose}>
        <ColorInputPopover>
          <SketchPicker {...rest} color={hexColor} disableAlpha={true} onChange={onChangePicker} />
        </ColorInputPopover>
      </Popover>
    </ColorInputContainer>
  )
}

ColorInput.defaultProps = {
  value: new Color(),
  onChange: () => {}
}

export default ColorInput
