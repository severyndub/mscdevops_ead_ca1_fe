#!groovy

properties([pipelineTriggers([githubPush()])])

    boolean buildImages = false
    def targetEnv = ""
    def deploymentType = ""
    boolean clearImages = true
    boolean cleanAks = false
    def branch = env.GIT_BRANCH?.trim().split('/').last().toLowerCase() //master
    def overrideVersion = params.BUILD_VERSION_OVERRIDE?.trim()
    boolean override = false
    def servicePrincipalId = '72555f61-7a9f-4145-8bb7-a163f107bccf'

node {

    properties([disableConcurrentBuilds()])

    //test

    try {

        env.BUILD_VERSION = "1.0.0.${env.BUILD_ID}"
        env.BUILD_LABEL = params.BUILD_LABEL?.trim()
        buildImages = params.BUILD_IMAGES
        targetEnv = params.TARGET_ENV?.trim()
        deploymentType = params.TARGET_ROLE?.trim()
        clearImages = params.CLEAR_IMAGES
        cleanAks = params.CLEAN_AKS        

        // Check if the build label is set
        if (buildImages) {
            if (!env.BUILD_LABEL) {
                error("Build label must be specified!: build label: ${env.BUILD_LABEL}")
            }
        // Check if this is an overide play
        } else if (overrideVersion != "1.0.0.0") {    
            env.BUILD_VERSION = overrideVersion
            buildImages = false
            override = true
        }

        //env.BUILD_LABEL = env.BUILD_LABEL + ':' + env.BUILD_VERSION

        switch(branch){
            case 'development':
                //env.TARGET_ROLE = 'blue'
                env.TARGET_PORT = '8080'
            break
            case 'master':
                //env.TARGET_ROLE = 'green'
                env.TARGET_PORT = '80'
            break
            default:
                echo "branch is neither development or master, deploying to BLUE type"
                //env.TARGET_ROLE = 'blue'
                env.TARGET_PORT = "${TARGET_PORT_MAN}"
        }

        echo """Parameters:
            branch: '${branch}' 
            BUILD LABEL: '$env.BUILD_LABEL'
            BUILD VERSION: '$env.BUILD_VERSION'
            buildImages: '${buildImages}'
            targetEnv: '${targetEnv}'
            clearImages: '${clearImages}'
            deploymentType: '${deploymentType}'
            cleanAks: '${cleanAks}'
            REPLICAS NO: '$env.REPLICAS_NO'
            TARGET_ROLE: '$env.TARGET_ROLE'
            overrideVersion: '${overrideVersion}'
            TARGET PORT: '${env.TARGET_PORT}'
        """

        if(cleanAks) {
            withCredentials([azureServicePrincipal(servicePrincipalId)]) {
                // Login to azure
                sh 'az login --service-principal -u $AZURE_CLIENT_ID -p $AZURE_CLIENT_SECRET -t $AZURE_TENANT_ID'
                // Set subscription context
                sh 'az account set -s $AZURE_SUBSCRIPTION_ID'
                // Set aks context
                sh 'az aks get-credentials --overwrite-existing --resource-group \"mscdevops-aks-rg\" --name \"mscdevops-aks\"'

                // Navigate to fe-service deployment directory
                dir('aks/frontend'){
                // Deploy the service
                sh "kubectl delete deployment fe-service-${env.TARGET_ROLE}"
                sh "kubectl delete services svc-fe-service-${env.TARGET_ROLE}"
                }
            }
            return 0
        }
        
        stage("Pull Source") {
            //trying to get the hash without checkout gets the hash set in previous build.
                def checkout = checkout scm
                env.COMMIT_HASH = checkout.GIT_COMMIT
                echo "Checkout done; Hash: '${env.COMMIT_HASH}'"
            }

        if(!cleanAks && !override){

            //This will use the content of the package.json file and install any needed dependencies into /node-modules folder
            stage("Install npm dependencies") {
                sh "npm install"
                echo "dependencies install completed"
            }
            
            if (buildImages) {
                stage("Build Images") {
                    echo "setting version: BUILD_LABEL='${env.BUILD_LABEL}'; COMMIT_HASH='${env.COMMIT_HASH}'"
                    sh "docker build -t '${env.BUILD_LABEL}:${env.BUILD_VERSION}' ."
                    echo "Docker containers built with tag '${env.BUILD_LABEL}:${env.BUILD_VERSION}'"
                    sh "docker images ${env.BUILD_LABEL}:${env.BUILD_VERSION}"
                }
                
                stage("Push Images") {
                    sh "chmod +x ./push_images.sh"
                    sh "./push_images.sh ${env.BUILD_LABEL} ${env.BUILD_VERSION}"
                    echo "Docker images pushed to repository"
                }
            }
   
        }

        stage('Check Env') {
        // check the current active environment to determine the inactive one that will be deployed to

            withCredentials([azureServicePrincipal(servicePrincipalId)]) {
                // fetch the current service configuration
                sh """
                    az login --service-principal -u $AZURE_CLIENT_ID -p $AZURE_CLIENT_SECRET -t $AZURE_TENANT_ID
                    az account set -s $AZURE_SUBSCRIPTION_ID
                    az aks get-credentials --overwrite-existing --resource-group mscdevops-aks-rg --name mscdevops-aks --admin --file kubeconfig
                    az logout
                    current_role="\$(kubectl --kubeconfig kubeconfig get services svc-fe-service --output json | jq -r .spec.selector.role)"
                    if [ "\$current_role" = null ]; then
                      echo "Unable to determine current environment"
                      exit 1
                    fi
                    echo "\$current_role" >current-environment
                """
            }

            // parse the current active backend
            currentEnvironment = readFile('current-environment').trim()

            // set the build name
            echo "***************************  CURRENT: $currentEnvironment     NEW: ${newEnvironment()}  *****************************"
            currentBuild.displayName = newEnvironment().toUpperCase() + ' ' + imageName

            env.TARGET_ROLE = newEnvironment()

            // clean the inactive environment
            sh """
                kubectl --kubeconfig=kubeconfig delete deployment "fe-service-\$TARGET_ROLE"
            """
        }

        stage("Queue deploy") {
                
            echo "Queueing Deploy job (${targetEnv}, ${env.BUILD_LABEL})."

            acsDeploy(azureCredentialsId: '72555f61-7a9f-4145-8bb7-a163f107bccf',
                resourceGroupName: 'mscdevops-aks-rg',
                containerService: 'mscdevops-aks | AKS',
                sshCredentialsId: '491fabd9-2952-4e79-9192-66b52c9dd389',
                configFilePaths: '**/frontend/*.yaml',
                enableConfigSubstitution: true,

            // Kubernetes
            secretName: 'mscdevops',
            secretNamespace: 'default',

            // Docker Swarm
            swarmRemoveContainersFirst: true,

            // DC/OS Marathon
            //dcosDockerCredentialsPath: '<dcos-credentials-path>',

            containerRegistryCredentials: [
                [credentialsId: 'dockerRegAccess', url: 'mcsdevopsentarch.azurecr.io'] ])
        }

        def verifyEnvironment = { service ->
            sh """
              endpoint_ip="\$(kubectl --kubeconfig=kubeconfig get services '${service}' --output json | jq -r '.status.loadBalancer.ingress[0].ip')"
              count=0
              while true; do
                  count=\$(expr \$count + 1)
                  if curl -m 10 "http://\$endpoint_ip"; then
                      break;
                  fi
                  if [ "\$count" -gt 30 ]; then
                      echo 'Timeout while waiting for the ${service} endpoint to be ready'
                      exit 1
                  fi
                  echo "${service} endpoint is not ready, wait 10 seconds..."
                  sleep 10
              done
            """
        }

        stage('Verify Staged') {
            // verify the deployment through the corresponding test endpoint
            verifyEnvironment("svc-fe-service-${newEnvironment()}")
        }
    
        stage('Switch') {
            // Update the production service endpoint to route to the new environment.
            // With enableConfigSubstitution set to true, the variables ${TARGET_ROLE}
            // will be replaced with environment variable values
            acsDeploy azureCredentialsId: servicePrincipalId,
                      resourceGroupName: resourceGroup,
                      containerService: "mscdevops-aks | AKS",
                      configFilePaths: '**/frontend/service.yml',
                      enableConfigSubstitution: true
        }
    
        stage('Verify Prod') {
            // verify the production environment is working properly
            verifyEnvironment('svc-fe-service')
        }


        stage("Get container public ip"){
            //sh "kubectl describe services svc-fe-service-${env.TARGET_ROLE} | grep 'LoadBalancer Ingress:' | awk '{printf \"%s\\n\", \$3}'"
            sh "kubectl get service svc-fe-service-${env.TARGET_ROLE} | awk '{printf \"%s\\n\", \$4}'"
        }

    } catch (e) {
        throw e
    } finally {
        if (buildImages && clearImages) {
            stage("Clear Images") {
                echo "Removing images with tag '${env.BUILD_LABEL}'"
                sh "docker images ${env.BUILD_LABEL}"
                sh "docker rmi -f \$(docker images | grep '${env.BUILD_LABEL}' | awk '{print \$3}')"
            }
        }
        // Recursively delete the current directory from the workspace
        deleteDir()
        echo "Build done."
    }
}