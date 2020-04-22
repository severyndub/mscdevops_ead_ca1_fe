#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Check Azure CLI login..."
if ! az group list >/dev/null 2>&1; then
    echo "Login Azure CLI required" >&2
    exit 1
fi

resource_group='mscdevops-aks-rg'
location='westeurope'
aks_name='mscdevops-aks'
dns_name_suffix='mscdevopsca'
companion_rg="MC_${resource_group}_${aks_name}_${location}"

kubeconfig="$(mktemp)"

echo "Fetch AKS credentials to $kubeconfig"
az aks get-credentials -g "$resource_group" -n "$aks_name" --admin --file "$kubeconfig"

SAVEIFS="$IFS"
IFS=$(echo -en "\n\b")
for config in "$DIR"/*.yml; do
    echo "Apply $config"
    kubectl apply -f "$config" --kubeconfig "$kubeconfig"
done
IFS="$SAVEIFS"

function assign_dns {
    service="$1"
    dns_name="$2"
    IP=
    while true; do
        echo "Waiting external IP for $service..."
        IP="$(kubectl get service "$service" --kubeconfig "$kubeconfig" | tail -n +2 | awk '{print $4}' | grep -v '<')"
        if [[ "$?" == 0 && -n "$IP" ]]; then
            echo "Service $service public IP: $IP"
            break
        fi
        sleep 10
    done

    public_ip="$(az network public-ip list -g "$companion_rg" --query "[?ipAddress==\`$IP\`] | [0].id" -o tsv)"
    if [[ -z "$public_ip" ]]; then
        echo "Cannot find public IP resource ID for '$service' in companion resource group '$companion_rg'" >&2
        exit 1
    fi

    echo "Assign DNS name '$dns_name' for '$service'"
    az network public-ip update --dns-name "$dns_name" --ids "$public_ip"
    [[ $? != 0 ]] && exit 1
}

assign_dns svc-fe-service "aks-fe-service$dns_name_suffix"
assign_dns svc-test-fe-service-blue "aks-fe-service-blue$dns_name_suffix"
assign_dns svc-test-fe-service-green "aks-fe-service-green$dns_name_suffix"

rm -f "$kubeconfig"

