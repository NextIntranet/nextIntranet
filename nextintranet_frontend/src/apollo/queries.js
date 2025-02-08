import { gql } from '@apollo/client/core';

export const GET_SUPPLIERS = gql`
  query GetSuppliers {
    allSuppliers {
      contactInfo
      name
      website
      id
    }
  }
`;


export const GET_PURCHASES = gql`
  query GetPurchases {
    allPurchase {
      id
      deliveryDate
      currency
      createdAt
      note
      status
      stockedDate
      totalPriceConverted
      totalPriceOriginal
      totalPriceOriginalVat
      supplier {
        id
        name
        website
      }
    }
  }
`;
