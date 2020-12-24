/*
 * Copyright 2020 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  ComponentEntityV1alpha1,
  Entity,
  LocationSpec,
} from '@backstage/catalog-model';
import AWS, { Organizations } from 'aws-sdk';
import { Account } from 'aws-sdk/clients/organizations';

import * as results from './results';
import { CatalogProcessor, CatalogProcessorEmit } from './types';

const AWS_ORGANIZATION_REGION = 'us-east-1';
const LOCATION_TYPE = 'aws-organization';

export class AwsOrganizationProcessor implements CatalogProcessor {
  organizations: Organizations;
  constructor() {
    this.organizations = new AWS.Organizations({
      region: AWS_ORGANIZATION_REGION,
    }); // Only available in us-east-1
  }

  async handleError(): Promise<void> {
    return undefined;
  }

  async postProcessEntity(entity: Entity): Promise<Entity> {
    return entity;
  }

  async preProcessEntity(entity: Entity): Promise<Entity> {
    return entity;
  }

  normalizeName(name: string): string {
    return name
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-zA-Z0-9\-]/g, '-');
  }

  extractInformationFromArn(
    arn: string,
  ): { accountId: string; organizationId: string } {
    const parts = arn.split('/');

    return {
      accountId: parts[parts.length - 1],
      organizationId: parts[parts.length - 2],
    };
  }

  async getAwsAccounts(): Promise<Account[]> {
    let awsAccounts: Account[] = [];
    let isInitialAttempt = true;
    let NextToken = undefined;
    while (isInitialAttempt || NextToken) {
      isInitialAttempt = false;
      const orgAccounts = await this.organizations
        .listAccounts({ NextToken })
        .promise();
      if (orgAccounts.Accounts) {
        awsAccounts = awsAccounts.concat(orgAccounts.Accounts);
        NextToken = orgAccounts.NextToken;
      }
    }

    return awsAccounts;
  }

  mapAccountToComponent(account: Account): ComponentEntityV1alpha1 {
    const { accountId, organizationId } = this.extractInformationFromArn(
      account.Arn as string,
    );
    return {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: {
        annotations: {
          'amazonaws.com/arn': account.Arn || '',
          'amazonaws.com/account-id': accountId,
          'amazonaws.com/organization-id': organizationId,
        },
        name: this.normalizeName(account.Name || ''),
        namespace: 'default',
      },
      spec: {
        type: 'cloud-account',
        lifecycle: 'unknown',
        owner: 'unknown',
      },
    };
  }

  async readLocation(
    location: LocationSpec,
    _optional: boolean,
    emit: CatalogProcessorEmit,
  ): Promise<boolean> {
    if (location.type !== LOCATION_TYPE) {
      return false;
    }

    (await this.getAwsAccounts())
      .map(account => this.mapAccountToComponent(account))
      .forEach((entity: ComponentEntityV1alpha1) => {
        emit(results.entity(location, entity));
      });

    return true;
  }

  async validateEntityKind(): Promise<boolean> {
    return false;
  }
}
