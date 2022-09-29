import {createActionQueue, removeActionQueue} from "@xrengine/hyperflux";
import {AdminGithubAppActions, AdminGithubAppReceptors} from "../admin/services/GithubAppService";

export default async function AdminSystem() {
    const githubAppFetchedQueue = createActionQueue(AdminGithubAppActions.githubAppFetched.matches)

    const execute = () => {
        for (const action of githubAppFetchedQueue()) AdminGithubAppReceptors.githubAppFetchedReceptor(action)
    }

    const cleanup = async () => {
        removeActionQueue(githubAppFetchedQueue)
    }

    return { execute, cleanup }
}