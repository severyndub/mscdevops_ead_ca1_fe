#!/usr/bin/env bash

DOCKER=docker
type docker >/dev/null 2>&1 || export DOCKER=/usr/bin/docker

tag=$2
imageName=$1

if [ -z ${tag} ]; then
    echo tag must be given
    exit 1
fi
dockerRegName=mcsdevopsentarch
dockerRegistry=mcsdevopsentarch.azurecr.io
retryCount=3

tryPushImage(){
    image=$1
    tries=${retryCount}

    while [ ${tries} -gt 0 ]; do
        az acr login --name ${dockerRegName}
        echo ${DOCKER} push ${image}
        ${DOCKER} push ${image}

        if [ $? -eq 0 ]; then
            return 0
        fi
        echo ${DOCKER} push ${image} failed
        ((tries--))
        if [ ${tries} -gt 0 ]; then
            sleep 10
        fi
    done
    return 1
}

main(){
    echo $1
    echo $2
    dockerImageFullName=${dockerRegistry}/${imageName}.*${tag}    
    dockerImageName="${imageName}:${tag}"
    echo "Tag image with docker tag ${dockerImageName} ${dockerRegistry}/${dockerImageName}"

    docker tag ${dockerImageName} ${dockerRegistry}/${dockerImageName}
    
    echo "finding images: '${dockerImageFullName}'"

    images=($(docker images | grep ${dockerImageFullName} | awk '{printf "%s:%s\n", $1, $2}'))

    echo found these images:
    echo ${images[@]}

    for image in ${images[@]}; do
        tryPushImage ${image} || exit 1
    done
}

main
