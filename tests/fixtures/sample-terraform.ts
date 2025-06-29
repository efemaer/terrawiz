/**
 * Sample Terraform and Terragrunt content for testing parsers
 */

export const terraformSamples = {
  simpleResource: `
resource "aws_instance" "example" {
  ami           = "ami-12345"
  instance_type = "t2.micro"
}
`,

  moduleUsage: `
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  version = "~> 3.0"
  
  name = "my-vpc"
  cidr = "10.0.0.0/16"
}

module "local_module" {
  source = "./modules/compute"
  
  instance_count = 3
}
`,

  gitModuleSource: `
module "security_group" {
  source = "git::https://github.com/cloudposse/terraform-aws-security-group.git?ref=tags/0.4.0"
  
  name = "example"
}

module "github_ssh" {
  source = "git@github.com:example/terraform-modules.git//network?ref=v1.0.0"
  
  vpc_id = module.vpc.vpc_id
}
`,

  multipleModules: `
terraform {
  required_version = ">= 1.0"
}

module "database" {
  source = "terraform-aws-modules/rds/aws"
  version = "5.1.0"
  
  identifier = "example-db"
}

module "cache" {
  source = "git::https://github.com/example/terraform-modules.git//cache?ref=v2.1.0"
  
  node_type = "cache.t3.micro"
}

module "monitoring" {
  source = "../shared/monitoring"
  
  environment = "production"
}

resource "aws_s3_bucket" "example" {
  bucket = "my-bucket"
}
`,

  complexConfiguration: `
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  environment = "production"
  common_tags = {
    Environment = local.environment
    Project     = "example"
  }
}

module "networking" {
  source = "git::https://git.company.com/terraform/networking.git?ref=v1.5.0"
  
  vpc_cidr = "10.0.0.0/16"
  availability_zones = ["us-west-2a", "us-west-2b", "us-west-2c"]
  
  tags = local.common_tags
}

module "compute" {
  source = "../modules/compute"
  count  = 3
  
  subnet_id = module.networking.private_subnets[count.index]
  instance_type = "t3.medium"
  
  tags = merge(local.common_tags, {
    Name = "web-server-\${count.index + 1}"
  })
}

module "database" {
  source = "app.terraform.io/company/database/aws"
  version = "2.3.1"
  
  vpc_id = module.networking.vpc_id
  subnet_ids = module.networking.database_subnets
  
  tags = local.common_tags
}
`,

  malformedModule: `
module "incomplete" {
  # Missing source
  version = "1.0.0"
  name = "test"
}

module "invalid_source" {
  source = ""
  version = "1.0.0"
}

resource "aws_instance" "example" {
  ami = "ami-12345"
}
`,

  edgeCases: `
# Module with no version
module "no_version" {
  source = "terraform-aws-modules/vpc/aws"
  name = "test-vpc"
}

# Module with complex version constraints
module "complex_version" {
  source = "hashicorp/consul/aws"
  version = ">= 1.0, < 2.0"
}

# Module with URL parameters
module "url_params" {
  source = "git::https://github.com/example/modules.git//vpc?ref=v1.0.0&depth=1"
}

# Module with local path variations
module "local_relative" {
  source = "./modules/vpc"
}

module "local_parent" {
  source = "../shared/security"
}

module "local_absolute" {
  source = "/opt/terraform/modules/monitoring"
}
`,
};

export const terragruntSamples = {
  basicTerragrunt: `
terraform {
  source = "git::https://github.com/example/terraform-modules.git//vpc?ref=v1.0.0"
}

include {
  path = find_in_parent_folders()
}

inputs = {
  vpc_name = "production"
  cidr_block = "10.0.0.0/16"
}
`,

  terragruntWithDependencies: `
terraform {
  source = "../../../modules/database"
}

include {
  path = find_in_parent_folders()
}

dependency "vpc" {
  config_path = "../vpc"
}

dependency "security" {
  config_path = "../security-groups"
}

inputs = {
  vpc_id = dependency.vpc.outputs.vpc_id
  security_group_ids = dependency.security.outputs.security_group_ids
  
  instance_class = "db.t3.micro"
  allocated_storage = 20
}
`,

  terragruntRemoteSource: `
terraform {
  source = "tfr:///terraform-aws-modules/rds/aws?version=5.1.0"
}

include {
  path = find_in_parent_folders()
}

inputs = {
  identifier = "example-db"
  engine = "postgres"
  engine_version = "13.7"
  
  allocated_storage = 100
  storage_type = "gp2"
}
`,

  terragruntMultipleSources: `
# This file has multiple terraform blocks (edge case)
terraform {
  source = "git::https://github.com/example/modules.git//vpc?ref=v1.0.0"
}

# This should not happen in real Terragrunt, but we should handle it
terraform {
  source = "../modules/security"
}

include {
  path = find_in_parent_folders()
}

inputs = {
  environment = "staging"
}
`,

  terragruntComplex: `
locals {
  environment = "production"
  region = "us-west-2"
  
  common_vars = yamldecode(file("common.yaml"))
}

terraform {
  source = "git::ssh://git@github.com/company/terraform-modules.git//applications/web-app?ref=v2.1.0"
  
  extra_arguments "common_vars" {
    commands = ["plan", "apply"]
    
    arguments = [
      "-var-file=\${get_parent_terragrunt_dir()}/common.tfvars"
    ]
  }
}

include {
  path = find_in_parent_folders()
}

dependency "network" {
  config_path = "../network"
  
  mock_outputs = {
    vpc_id = "vpc-12345"
    subnet_ids = ["subnet-12345", "subnet-67890"]
  }
}

dependency "database" {
  config_path = "../database"
  skip_outputs = true
}

inputs = merge(local.common_vars, {
  environment = local.environment
  region = local.region
  
  vpc_id = dependency.network.outputs.vpc_id
  subnet_ids = dependency.network.outputs.subnet_ids
  
  app_name = "web-application"
  instance_count = 3
})
`,

  terragruntMalformed: `
# Missing terraform block
include {
  path = find_in_parent_folders()
}

inputs = {
  name = "test"
}

# Invalid terraform block
terraform {
  # No source specified
  extra_arguments "test" {
    commands = ["plan"]
  }
}
`,

  terragruntEdgeCases: `
# Terraform block with empty source
terraform {
  source = ""
}

# Terraform block with whitespace source
terraform {
  source = "   "
}

# Valid terraform block
terraform {
  source = "git::https://github.com/example/modules.git//compute"
}

include {
  path = find_in_parent_folders()
}

inputs = {
  instance_type = "t3.micro"
}
`,
};

export const mixedContent = {
  terraformWithComments: `
# This is a comment
/* This is a block comment */

module "vpc" {
  source = "terraform-aws-modules/vpc/aws" # Inline comment
  version = "~> 3.0"
  
  name = "my-vpc" /* Another comment */
  cidr = "10.0.0.0/16"
}

/*
module "commented_out" {
  source = "should-not-be-parsed"
}
*/

module "actual_module" {
  source = "git::https://github.com/example/modules.git//vpc"
}
`,

  terragruntWithComments: `
# Configuration for production environment
terraform {
  source = "git::https://github.com/example/modules.git//database?ref=v1.0.0" # Database module
}

/*
This is a multi-line comment
terraform {
  source = "should-not-be-parsed"
}
*/

include {
  path = find_in_parent_folders()
}

inputs = {
  environment = "production" # Environment setting
}
`,
};

/**
 * Expected parsing results for testing
 */
export const expectedResults = {
  terraformSimpleResource: [],

  terraformModuleUsage: [
    {
      name: 'vpc',
      source: 'terraform-aws-modules/vpc/aws',
      sourceType: 'registry',
      version: '~> 3.0',
      type: 'terraform',
    },
    {
      name: 'local_module',
      source: './modules/compute',
      sourceType: 'local',
      version: undefined,
      type: 'terraform',
    },
  ],

  terragruntBasic: [
    {
      source: 'git::https://github.com/example/terraform-modules.git//vpc?ref=v1.0.0',
      sourceType: 'git',
      version: 'v1.0.0',
      type: 'terragrunt',
    },
  ],
};
