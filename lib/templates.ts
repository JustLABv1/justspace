export const DEPLOYMENT_TEMPLATES = [
    {
        name: 'Azure Web App Deployment',
        tasks: [
            'Configure Azure Resource Group',
            'Create App Service Plan',
            'Provision Web App (Linux/Node)',
            'Set up Deployment Center (GitHub Actions)',
            'Configure environment variables (App Settings)',
            'Verify SSL/TLS and Custom Domain',
            'Perform smoke tests'
        ]
    },
    {
        name: 'AWS EKS Cluster Setup',
        tasks: [
            'Provision VPC with public/private subnets',
            'Create IAM roles for cluster and nodes',
            'Deploy EKS Cluster control plane',
            'Provision Managed Node Groups',
            'Install AWS Load Balancer Controller',
            'Configure kubectl and verify nodes',
            'Deploy sample application'
        ]
    },
    {
        name: 'Standard Docker/Compose Rollout',
        tasks: [
            'Verify Docker and Compose installation',
            'Create project directory on host',
            'Sync local environment files to host',
            'Build and push images to registry',
            'Run docker-compose up -d',
            'Check container health status',
            'Configure Nginx/Reverse Proxy'
        ]
    }
];
