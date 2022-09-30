import classNames from 'classnames'
import { useTranslation } from 'react-i18next'

import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import DialogActions from '@mui/material/DialogActions'
import DialogTitle from '@mui/material/DialogTitle'

import DrawerView from '../../common/DrawerView'
import styles from "../../styles/admin.module.scss";
import React, { useEffect, useState } from "react";
import InputSelect, {InputMenuItem} from "../../common/InputSelect";
import {BuilderTag} from "@xrengine/common/src/interfaces/BuilderTags";
import {ProjectService} from "../../../common/services/ProjectService";

interface Props {
    open: boolean
    builderTags: BuilderTag[]
    onClose: () => void
}


const UpdateDrawer = ({ open, builderTags, onClose }: Props) => {
    const { t } = useTranslation()
    const [error, setError] = useState('')
    const [selectedTag, setSelectedTag] = useState('')

    const handleClose = () => {
        setError('')
        setSelectedTag('')
        onClose()
    }

    const handleTagChange = async (e) => {
        setSelectedTag(e.target.value)
    }

    const tagMenu: InputMenuItem[] = builderTags.map(el => {
        const pushedDate = new Date(el.pushedAt).toLocaleString('en-us', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })
        return {
            value: el.tag,
            label: `Engine Version ${el.engineVersion} -- Commit ${el.commitSHA.slice(0, 8)} -- Pushed ${pushedDate}`
        }
    })

    const handleSubmit = async() => {
        await ProjectService.updateEngine(selectedTag)
        handleClose()
    }

    return (
        <DrawerView open={open} onClose={handleClose}>
            <Container maxWidth="sm" className={styles.mt20}>
                <DialogTitle className={classNames({
                    [styles.textAlign]: true,
                    [styles.drawerHeader]: true
                })}> {t('admin:components.project.updateEngine')}</DialogTitle>

                {
                    <InputSelect
                        name="tagData"
                        label={t('admin:components.project.tagData')}
                        value={selectedTag}
                        menu={tagMenu}
                        error={error}
                        onChange={handleTagChange}
                    />
                }

                <DialogActions>
                    {
                        <>
                            <Button className={styles.outlinedButton} onClick={handleClose}>
                                {t('admin:components.common.cancel')}
                            </Button>
                            <Button className={styles.gradientButton} disabled={selectedTag === ''} onClick={handleSubmit}>
                                {t('admin:components.common.submit')}
                            </Button>
                        </>
                    }
                </DialogActions>
            </Container>
        </DrawerView>
    )
}

export default UpdateDrawer